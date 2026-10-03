import { describe, expect, test } from "bun:test";
import { meteringIdentityToPartitionKey } from "@autumn/balance-engine";
import type { FlushRequest } from "@autumn/postgres";
import { createCommitter } from "../../../src/committer/createCommitter.js";
import { createCommitterStateStore } from "../../../src/committer/createCommitterStateStore.js";
import { SNAPSHOT_LANE_MAX_PENDING } from "../../../src/committer/subjectSnapshots/createSnapshotQueues.js";
import type { CommitterDb } from "../../../src/types/committerDb.js";
import { createState, createTrackMutation } from "../../fixtures/mutations.js";
import { createSubjectSnapshotsStore } from "../../fixtures/subjectSnapshotsStore.js";

const topic = "autumn-metering";
const retry = {
	degradedAfterAttempts: 1,
	initialBackoffMs: 1,
	maxBackoffMs: 1,
};
const DROP_BATCH = 500;

/** A Postgres stand-in that counts statements and how many run at once; `gate` holds every flush until it resolves. */
const createCountingDb = ({
	gate = Promise.resolve(),
	failDeletes = false,
}: {
	gate?: Promise<unknown>;
	failDeletes?: boolean;
} = {}) => {
	const requests: FlushRequest[] = [];
	let inFlight = 0;
	let maxInFlight = 0;
	const db: CommitterDb = {
		readPartitionProgress: async () => null,
		insertPartitionProgress: async () => {},
		claimPartitionProgress: async () => {},
		flush: async (request) => {
			requests.push(request);
			inFlight += 1;
			maxInFlight = Math.max(maxInFlight, inFlight);
			try {
				await gate;
				if (failDeletes && (request.snapshots?.deletes.length ?? 0) > 0)
					throw new Error("relation subject_snapshots does not exist");
				return { applied: request.changes.map(() => true) };
			} finally {
				inFlight -= 1;
			}
		},
	};
	const deleteStatements = () =>
		requests.filter((request) => (request.snapshots?.deletes.length ?? 0) > 0);
	return { db, requests, deleteStatements, maxInFlight: () => maxInFlight };
};

const createStore = ({
	db,
	requestCount,
	warnings = [],
	subjectSnapshotsConfig = createSubjectSnapshotsStore({
		mode: "write",
		dropBatch: DROP_BATCH,
	}),
}: {
	db: CommitterDb;
	requestCount: () => number;
	warnings?: string[];
	subjectSnapshotsConfig?: ReturnType<typeof createSubjectSnapshotsStore>;
}) => {
	const committer = createCommitter({
		ctx: { db, subjectSnapshotsConfig },
		config: {
			concurrency: 32,
			maxRowsPerFlush: 500,
			retry,
			snapshots: { partitionCount: 64 },
		},
	});
	const store = createCommitterStateStore({
		ctx: {
			committer,
			db,
			logger: { warn: (message) => warnings.push(message) },
			subjectSnapshotsConfig,
		},
	});
	const deletes = store.snapshotQueues;
	if (!deletes) throw new Error("expected snapshot writes");
	/** Lane ticks hand the committer one DELETE at a time, so quiet means every tick has run and landed. */
	const drained = async () => {
		for (let quiet = 0; quiet < 3; ) {
			await committer.drain();
			await Bun.sleep(2);
			quiet = statementsSeen() === statementsSeen.last ? quiet + 1 : 0;
			statementsSeen.last = statementsSeen();
		}
	};
	const statementsSeen = Object.assign(() => requestCount(), { last: -1 });
	return { store, deletes, drained };
};

/** A deleted customer comes back as the customer part of its identity: what the engine's key names. */
const customerOf = (index: number) => ({
	orgId: "org_1",
	env: "sandbox",
	customerId: `cus_${index}`,
	entityId: null,
});
const keyOf = (index: number) =>
	meteringIdentityToPartitionKey({ identity: customerOf(index) });

describe("snapshot lane writes: evict deletes", () => {
	test("enqueue is synchronous and returns nothing: evicts of one tick land as one DELETE, each customer once", async () => {
		const { db, requests } = createCountingDb();
		const { deletes, drained } = createStore({
			db,
			requestCount: () => requests.length,
		});

		for (const index of [1, 2, 3, 2])
			expect(
				deletes.enqueueDelete({
					topic,
					partition: 4,
					customerKey: keyOf(index),
				}),
			).toBeUndefined();
		expect(requests).toHaveLength(0);
		await drained();

		expect(requests).toEqual([
			{
				changes: [],
				bookmarks: [],
				snapshots: {
					upserts: [],
					deletes: [customerOf(1), customerOf(2), customerOf(3)],
				},
			},
		]);
	});

	test("a storm of 10,000 on one partition is ceil(10,000 / batch) DELETEs, one in flight at a time", async () => {
		const { db, requests, deleteStatements, maxInFlight } = createCountingDb();
		const { deletes, drained } = createStore({
			db,
			requestCount: () => requests.length,
		});

		for (let index = 0; index < 10_000; index++)
			deletes.enqueueDelete({ topic, partition: 4, customerKey: keyOf(index) });
		await drained();

		const statements = deleteStatements();
		expect(statements).toHaveLength(Math.ceil(10_000 / DROP_BATCH));
		expect(
			statements.reduce(
				(total, request) => total + (request.snapshots?.deletes.length ?? 0),
				0,
			),
		).toBe(10_000);
		expect(maxInFlight()).toBe(1);
	});

	test("a storm spread over partitions batches per partition, one in flight per partition", async () => {
		const held = Promise.withResolvers<void>();
		const { db, requests, deleteStatements, maxInFlight } = createCountingDb({
			gate: held.promise,
		});
		const { deletes, drained } = createStore({
			db,
			requestCount: () => requests.length,
		});

		for (let index = 0; index < 10_000; index++)
			deletes.enqueueDelete({
				topic,
				partition: index % 4,
				customerKey: keyOf(index),
			});
		await Bun.sleep(5);
		expect(deleteStatements()).toHaveLength(4);
		held.resolve();
		await drained();

		// 2,500 per partition: ceil(2,500 / 500) each.
		expect(deleteStatements()).toHaveLength(4 * 5);
		expect(maxInFlight()).toBe(4);
	});

	test("a DELETE waits behind the partition's apply already in flight: Postgres order is lane order", async () => {
		const held = Promise.withResolvers<void>();
		const { db, requests } = createCountingDb({ gate: held.promise });
		const { store, deletes, drained } = createStore({
			db,
			requestCount: () => requests.length,
		});
		await store.initializePartition({ topic, partition: 4, nextOffset: 0n });
		const state = createState({ balance: 100 });

		const applied = store.applyDurableMutations({
			records: [
				{
					position: { topic, partition: 4, offset: 0n },
					mutation: createTrackMutation({ state, value: 5 }),
				},
			],
		});
		await Bun.sleep(1);
		deletes.enqueueDelete({ topic, partition: 4, customerKey: keyOf(99) });
		await Bun.sleep(5);

		// Only the apply's flush has reached Postgres; the DELETE waits for it to settle.
		expect(requests).toHaveLength(1);
		expect(requests[0]?.snapshots?.deletes ?? []).not.toContainEqual(
			customerOf(99),
		);
		held.resolve();
		await applied;
		await drained();
		expect(requests.at(-1)?.snapshots?.deletes).toEqual([customerOf(99)]);
	});

	test("a DELETE that cannot land is logged once per batch and the lane carries on", async () => {
		const { db, requests, deleteStatements } = createCountingDb({
			failDeletes: true,
		});
		const warnings: string[] = [];
		const { deletes, drained } = createStore({
			db,
			requestCount: () => requests.length,
			warnings,
		});

		for (const index of [1, 2])
			deletes.enqueueDelete({ topic, partition: 4, customerKey: keyOf(index) });
		await drained();
		deletes.enqueueDelete({ topic, partition: 4, customerKey: keyOf(3) });
		await drained();

		expect(deleteStatements()).toHaveLength(2);
		expect(warnings).toHaveLength(2);
		expect(warnings[0]).toContain("could not write 2 customers' rows");
	});

	test("past the pending ceiling a partition stops enqueuing and warns once; nothing is awaited or thrown", async () => {
		const held = Promise.withResolvers<void>();
		const { db, requests, deleteStatements } = createCountingDb({
			gate: held.promise,
		});
		const warnings: string[] = [];
		const { deletes, drained } = createStore({
			db,
			requestCount: () => requests.length,
			warnings,
		});

		// One synchronous burst: no tick runs between enqueues, so the ceiling is what one tick can find waiting.
		const offered = SNAPSHOT_LANE_MAX_PENDING + 50;
		for (let index = 0; index < offered; index++)
			deletes.enqueueDelete({ topic, partition: 4, customerKey: keyOf(index) });
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain(
			`${SNAPSHOT_LANE_MAX_PENDING} customers pending`,
		);
		held.resolve();
		await drained();

		const deleted = deleteStatements().reduce(
			(total, request) => total + (request.snapshots?.deletes.length ?? 0),
			0,
		);
		expect(deleted).toBe(SNAPSHOT_LANE_MAX_PENDING);
	});

	test("with the store off, an enqueue is a no-op and Postgres sees no statement", async () => {
		const { db, requests } = createCountingDb();
		const { deletes, drained } = createStore({
			db,
			requestCount: () => requests.length,
			subjectSnapshotsConfig: createSubjectSnapshotsStore({ mode: "off" }),
		});

		deletes.enqueueDelete({ topic, partition: 4, customerKey: keyOf(1) });
		await drained();

		expect(requests).toEqual([]);
	});

	test("a flip takes effect at the next tick: write → off drops what is pending, off → write lands the next enqueue", async () => {
		const held = Promise.withResolvers<void>();
		const { db, requests, deleteStatements } = createCountingDb({
			gate: held.promise,
		});
		const subjectSnapshotsConfig = createSubjectSnapshotsStore({
			mode: "write",
			dropBatch: 1,
		});
		const { deletes, drained } = createStore({
			db,
			requestCount: () => requests.length,
			subjectSnapshotsConfig,
		});

		for (const index of [1, 2])
			deletes.enqueueDelete({ topic, partition: 4, customerKey: keyOf(index) });
		await Bun.sleep(2);
		subjectSnapshotsConfig._setRuntimeConfigForTesting({
			...subjectSnapshotsConfig.get(),
			mode: "off",
		});
		held.resolve();
		await drained();
		expect(deleteStatements().map((r) => r.snapshots?.deletes)).toEqual([
			[customerOf(1)],
		]);

		subjectSnapshotsConfig._setRuntimeConfigForTesting({
			...subjectSnapshotsConfig.get(),
			mode: "write",
		});
		deletes.enqueueDelete({ topic, partition: 4, customerKey: keyOf(3) });
		await drained();
		expect(deleteStatements().map((r) => r.snapshots?.deletes)).toEqual([
			[customerOf(1)],
			[customerOf(3)],
		]);
	});
});

describe("snapshot lane writes: deleteLanded", () => {
	test("resolves once the tick carrying the customer's DELETE ran; duplicates share it; a customer without one is settled at once", async () => {
		const held = Promise.withResolvers<void>();
		const { db, requests } = createCountingDb({ gate: held.promise });
		const { store, deletes, drained } = createStore({
			db,
			requestCount: () => requests.length,
		});
		await store.initializePartition({ topic, partition: 4, nextOffset: 0n });
		const at = (index: number) => ({
			topic,
			partition: 4,
			customerKey: keyOf(index),
		});

		deletes.enqueueDelete(at(1));
		deletes.enqueueDelete(at(1));
		let landed = false;
		const landing = deletes.deleteLanded(at(1)).then(() => {
			landed = true;
		});
		await Bun.sleep(5);
		expect(requests).toHaveLength(1);
		expect(landed).toBe(false);
		await expect(deletes.deleteLanded(at(2))).resolves.toEqual([]);

		held.resolve();
		await landing;
		await drained();
		expect(requests).toHaveLength(1);
		await expect(deletes.deleteLanded(at(1))).resolves.toEqual([]);
	});

	test("resolves with the rows the statement removed for that customer alone, as the worker names them", async () => {
		const { db, requests } = createCountingDb();
		db.flush = async (request) => {
			requests.push(request);
			return {
				applied: [],
				snapshots: {
					upserted: 0,
					deleted: (request.snapshots?.deletes ?? []).flatMap((customer) =>
						["", "en_1"].map((entityId) => ({
							...customer,
							entityId: entityId === "" ? null : entityId,
						})),
					),
				},
			};
		};
		const { store, deletes } = createStore({
			db,
			requestCount: () => requests.length,
		});
		await store.initializePartition({ topic, partition: 4, nextOffset: 0n });
		deletes.enqueueDelete({ topic, partition: 4, customerKey: keyOf(1) });
		deletes.enqueueDelete({ topic, partition: 4, customerKey: keyOf(2) });
		const [first, second] = await Promise.all([
			deletes.deleteLanded({ topic, partition: 4, customerKey: keyOf(1) }),
			deletes.deleteLanded({ topic, partition: 4, customerKey: keyOf(2) }),
		]);
		expect(first).toEqual([
			{ ...customerOf(1), entityId: null },
			{ ...customerOf(1), entityId: "en_1" },
		]);
		expect(second.map((row) => row.customerId)).toEqual(["cus_2", "cus_2"]);
	});

	test("a DELETE enqueued while the customer's earlier one is in flight waits for the later tick", async () => {
		const held = Promise.withResolvers<void>();
		const { db, requests } = createCountingDb({ gate: held.promise });
		const { store, deletes, drained } = createStore({
			db,
			requestCount: () => requests.length,
		});
		await store.initializePartition({ topic, partition: 4, nextOffset: 0n });
		const at = { topic, partition: 4, customerKey: keyOf(1) };
		deletes.enqueueDelete(at);
		await Bun.sleep(2);
		deletes.enqueueDelete(at);
		const ticks: number[] = [];
		const landing = deletes.deleteLanded(at).then(() => {
			ticks.push(requests.length);
		});
		held.resolve();
		await landing;
		await drained();
		expect(ticks).toEqual([2]);
	});

	test("a refused DELETE still answers: the lane's warning is the record", async () => {
		const { db, requests } = createCountingDb({ failDeletes: true });
		const warnings: string[] = [];
		const { store, deletes } = createStore({
			db,
			requestCount: () => requests.length,
			warnings,
		});
		await store.initializePartition({ topic, partition: 4, nextOffset: 0n });
		const at = { topic, partition: 4, customerKey: keyOf(1) };
		deletes.enqueueDelete(at);
		await deletes.deleteLanded(at);
		expect(warnings).toHaveLength(1);
	});
});

describe("snapshot lane writes: refreshes", () => {
	const stateOf = (index: number) =>
		createState({ identity: customerOf(index), balance: 100 });

	test("a refresh lands as an upsert carrying the partition's bookmark and claim: the fence a stale owner rolls back on", async () => {
		const { db, requests } = createCountingDb();
		const { store, deletes, drained } = createStore({
			db,
			requestCount: () => requests.length,
		});
		await store.initializePartition({ topic, partition: 4, nextOffset: 7n });
		await store.claimPartition({ topic, partition: 4 });

		deletes.enqueueRefresh({
			topic,
			partition: 4,
			state: stateOf(1),
			baselineAt: 1_700_000_000_000,
		});
		await drained();

		expect(requests).toHaveLength(1);
		expect(
			requests[0]?.snapshots?.upserts.map((row) => row.customerId),
		).toEqual(["cus_1"]);
		expect(requests[0]?.snapshots?.deletes).toEqual([]);
		expect(requests[0]?.bookmarks).toEqual([
			expect.objectContaining({
				partition: 4,
				expectedOffset: 7n,
				nextOffset: 7n,
				claimToken: expect.any(String),
			}),
		]);
	});

	test("deletes alone carry no bookmark: a DELETE is always safe", async () => {
		const { db, requests } = createCountingDb();
		const { store, deletes, drained } = createStore({
			db,
			requestCount: () => requests.length,
		});
		await store.initializePartition({ topic, partition: 4, nextOffset: 7n });
		await store.claimPartition({ topic, partition: 4 });
		deletes.enqueueDelete({ topic, partition: 4, customerKey: keyOf(1) });
		await drained();
		expect(requests[0]?.bookmarks).toEqual([]);
	});

	test("a DELETE enqueued after a pending refresh replaces it: the latest word on a customer is what lands", async () => {
		const held = Promise.withResolvers<void>();
		const { db, requests } = createCountingDb({ gate: held.promise });
		const { store, deletes, drained } = createStore({
			db,
			requestCount: () => requests.length,
		});
		await store.initializePartition({ topic, partition: 4, nextOffset: 0n });
		// A tick is in flight for cus_9, so what follows waits in the pending map.
		deletes.enqueueDelete({ topic, partition: 4, customerKey: keyOf(9) });
		await Bun.sleep(2);
		deletes.enqueueRefresh({
			topic,
			partition: 4,
			state: stateOf(1),
			baselineAt: 1,
		});
		deletes.enqueueDelete({ topic, partition: 4, customerKey: keyOf(1) });
		held.resolve();
		await drained();

		const second = requests[1]?.snapshots;
		expect(second?.upserts).toEqual([]);
		expect(second?.deletes).toEqual([customerOf(1)]);
	});

	test("a refresh refused by Postgres is logged and the lane carries on", async () => {
		const { db, requests } = createCountingDb({ failDeletes: false });
		const warnings: string[] = [];
		const flush = db.flush;
		db.flush = async (request) => {
			if ((request.snapshots?.upserts.length ?? 0) > 0)
				throw new Error("bookmark moved");
			return flush(request);
		};
		const { store, deletes, drained } = createStore({
			db,
			requestCount: () => requests.length,
			warnings,
		});
		await store.initializePartition({ topic, partition: 4, nextOffset: 0n });
		deletes.enqueueRefresh({
			topic,
			partition: 4,
			state: stateOf(1),
			baselineAt: 1,
		});
		await drained();
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("could not write 1 customers' rows");
	});

	test("deletes and refreshes never share a statement: a stale owner's refresh conflict cannot take a DELETE down with it", async () => {
		const held = Promise.withResolvers<void>();
		const { db, requests } = createCountingDb({ gate: held.promise });
		const { store, deletes, drained } = createStore({
			db,
			requestCount: () => requests.length,
		});
		await store.initializePartition({ topic, partition: 4, nextOffset: 0n });
		deletes.enqueueDelete({ topic, partition: 4, customerKey: keyOf(9) });
		await Bun.sleep(2);
		deletes.enqueueDelete({ topic, partition: 4, customerKey: keyOf(1) });
		deletes.enqueueRefresh({
			topic,
			partition: 4,
			state: stateOf(2),
			baselineAt: 1,
		});
		deletes.enqueueDelete({ topic, partition: 4, customerKey: keyOf(3) });
		held.resolve();
		await drained();

		const kinds = requests.slice(1).map((request) => ({
			deletes: request.snapshots?.deletes.map((d) => d.customerId),
			upserts: request.snapshots?.upserts.map((row) => row.customerId),
			bookmarks: request.bookmarks.length,
		}));
		expect(kinds).toEqual([
			{ deletes: ["cus_1", "cus_3"], upserts: [], bookmarks: 0 },
			{ deletes: [], upserts: ["cus_2"], bookmarks: 1 },
		]);
	});

	test("a refresh enqueued while the customer's DELETE pends lands after it: deletes first, then the refreshes", async () => {
		const held = Promise.withResolvers<void>();
		const { db, requests } = createCountingDb({ gate: held.promise });
		const { store, deletes, drained } = createStore({
			db,
			requestCount: () => requests.length,
		});
		await store.initializePartition({ topic, partition: 4, nextOffset: 0n });
		deletes.enqueueDelete({ topic, partition: 4, customerKey: keyOf(9) });
		await Bun.sleep(2);
		deletes.enqueueDelete({ topic, partition: 4, customerKey: keyOf(1) });
		deletes.enqueueRefresh({
			topic,
			partition: 4,
			state: stateOf(1),
			baselineAt: 1,
		});
		held.resolve();
		await drained();

		const kinds = requests.slice(1).map((request) => ({
			deletes: request.snapshots?.deletes.map((d) => d.customerId),
			upserts: request.snapshots?.upserts.map((row) => row.customerId),
		}));
		expect(kinds).toEqual([
			{ deletes: ["cus_1"], upserts: [] },
			{ deletes: [], upserts: ["cus_1"] },
		]);
	});

	test("a customer's refreshed subjects land together, aged by the earliest read; a subject refreshed twice takes the latest word", async () => {
		const held = Promise.withResolvers<void>();
		const { db, requests } = createCountingDb({ gate: held.promise });
		const { store, deletes, drained } = createStore({
			db,
			requestCount: () => requests.length,
		});
		await store.initializePartition({ topic, partition: 4, nextOffset: 0n });
		deletes.enqueueDelete({ topic, partition: 4, customerKey: keyOf(9) });
		await Bun.sleep(2);
		const entity = createState({
			identity: { ...customerOf(1), entityId: "en_1" },
			balance: 7,
		});
		deletes.enqueueRefresh({
			topic,
			partition: 4,
			state: entity,
			baselineAt: 5,
		});
		deletes.enqueueRefresh({
			topic,
			partition: 4,
			state: stateOf(1),
			baselineAt: 3,
		});
		deletes.enqueueRefresh({
			topic,
			partition: 4,
			state: createState({ identity: customerOf(1), balance: 42 }),
			baselineAt: 9,
		});
		held.resolve();
		await drained();

		const rows = requests[1]?.snapshots?.upserts ?? [];
		expect(
			rows.map((row) => [row.customerId, row.entityId, row.baselineAt]),
		).toEqual([
			["cus_1", "en_1", 3],
			["cus_1", null, 3],
		]);
		expect(requests[1]?.snapshots?.upserts.length).toBe(2);
		expect(
			JSON.parse(rows[1]?.stateJson ?? "{}").customerEntitlements[0].balance,
		).toBe(42);
	});

	test("at the pending ceiling a customer already pending still takes the latest word", async () => {
		const held = Promise.withResolvers<void>();
		const { db, requests, deleteStatements } = createCountingDb({
			gate: held.promise,
		});
		const { store, deletes, drained } = createStore({
			db,
			requestCount: () => requests.length,
		});
		await store.initializePartition({ topic, partition: 4, nextOffset: 0n });
		deletes.enqueueDelete({ topic, partition: 4, customerKey: keyOf(-1) });
		await Bun.sleep(2);
		for (let index = 0; index < SNAPSHOT_LANE_MAX_PENDING; index++)
			deletes.enqueueRefresh({
				topic,
				partition: 4,
				state: stateOf(index),
				baselineAt: 1,
			});
		// Full: a new customer is refused, a pending one is replaced.
		deletes.enqueueRefresh({
			topic,
			partition: 4,
			state: stateOf(SNAPSHOT_LANE_MAX_PENDING),
			baselineAt: 1,
		});
		deletes.enqueueDelete({ topic, partition: 4, customerKey: keyOf(5) });
		held.resolve();
		await drained();

		const deleted = deleteStatements().flatMap((request) =>
			(request.snapshots?.deletes ?? []).map((d) => d.customerId),
		);
		expect(deleted).toContain("cus_5");
		expect(deleted).not.toContain(`cus_${SNAPSHOT_LANE_MAX_PENDING}`);
	});
});
