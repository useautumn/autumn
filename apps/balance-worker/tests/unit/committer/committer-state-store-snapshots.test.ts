import { describe, expect, test } from "bun:test";
import { meteringIdentityToPartitionKey } from "@autumn/balance-engine";
import type { FlushRequest } from "@autumn/postgres";
import { createCommitter } from "../../../src/committer/createCommitter.js";
import { createCommitterStateStore } from "../../../src/committer/createCommitterStateStore.js";
import { EVICT_DELETES_MAX_PENDING } from "../../../src/committer/subjectSnapshots/createEvictDeletes.js";
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
	subjectSnapshots = createSubjectSnapshotsStore({
		mode: "write",
		dropBatch: DROP_BATCH,
	}),
}: {
	db: CommitterDb;
	requestCount: () => number;
	warnings?: string[];
	subjectSnapshots?: ReturnType<typeof createSubjectSnapshotsStore>;
}) => {
	const committer = createCommitter({
		ctx: { db, subjectSnapshots },
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
			subjectSnapshots,
		},
	});
	const deletes = store.evictDeletes;
	if (!deletes) throw new Error("expected evict deletes");
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

describe("committer state store evict deletes", () => {
	test("enqueue is synchronous and returns nothing: evicts of one tick land as one DELETE, each customer once", async () => {
		const { db, requests } = createCountingDb();
		const { deletes, drained } = createStore({
			db,
			requestCount: () => requests.length,
		});

		for (const index of [1, 2, 3, 2])
			expect(
				deletes.enqueue({ topic, partition: 4, customerKey: keyOf(index) }),
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
			deletes.enqueue({ topic, partition: 4, customerKey: keyOf(index) });
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
			deletes.enqueue({
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
		deletes.enqueue({ topic, partition: 4, customerKey: keyOf(99) });
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
			deletes.enqueue({ topic, partition: 4, customerKey: keyOf(index) });
		await drained();
		deletes.enqueue({ topic, partition: 4, customerKey: keyOf(3) });
		await drained();

		expect(deleteStatements()).toHaveLength(2);
		expect(warnings).toHaveLength(2);
		expect(warnings[0]).toContain("could not delete 2 customers' rows");
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
		const offered = EVICT_DELETES_MAX_PENDING + 50;
		for (let index = 0; index < offered; index++)
			deletes.enqueue({ topic, partition: 4, customerKey: keyOf(index) });
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain(
			`${EVICT_DELETES_MAX_PENDING} customers pending`,
		);
		held.resolve();
		await drained();

		const deleted = deleteStatements().reduce(
			(total, request) => total + (request.snapshots?.deletes.length ?? 0),
			0,
		);
		expect(deleted).toBe(EVICT_DELETES_MAX_PENDING);
	});

	test("with the store off, an enqueue is a no-op and Postgres sees no statement", async () => {
		const { db, requests } = createCountingDb();
		const { deletes, drained } = createStore({
			db,
			requestCount: () => requests.length,
			subjectSnapshots: createSubjectSnapshotsStore({ mode: "off" }),
		});

		deletes.enqueue({ topic, partition: 4, customerKey: keyOf(1) });
		await drained();

		expect(requests).toEqual([]);
	});

	test("a flip takes effect at the next tick: write → off drops what is pending, off → write lands the next enqueue", async () => {
		const held = Promise.withResolvers<void>();
		const { db, requests, deleteStatements } = createCountingDb({
			gate: held.promise,
		});
		const subjectSnapshots = createSubjectSnapshotsStore({
			mode: "write",
			dropBatch: 1,
		});
		const { deletes, drained } = createStore({
			db,
			requestCount: () => requests.length,
			subjectSnapshots,
		});

		for (const index of [1, 2])
			deletes.enqueue({ topic, partition: 4, customerKey: keyOf(index) });
		await Bun.sleep(2);
		subjectSnapshots._setRuntimeConfigForTesting({
			...subjectSnapshots.get(),
			mode: "off",
		});
		held.resolve();
		await drained();
		expect(deleteStatements().map((r) => r.snapshots?.deletes)).toEqual([
			[customerOf(1)],
		]);

		subjectSnapshots._setRuntimeConfigForTesting({
			...subjectSnapshots.get(),
			mode: "write",
		});
		deletes.enqueue({ topic, partition: 4, customerKey: keyOf(3) });
		await drained();
		expect(deleteStatements().map((r) => r.snapshots?.deletes)).toEqual([
			[customerOf(1)],
			[customerOf(3)],
		]);
	});
});
