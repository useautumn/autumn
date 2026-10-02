import { describe, expect, test } from "bun:test";
import {
	type MeteringIdentity,
	meteringIdentityToPartitionKey,
	type SubjectState,
} from "@autumn/balance-engine";
import { BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION } from "@autumn/env/balanceWorkerConstants";
import type { FlushRequest, SubjectRowChange } from "@autumn/postgres";
import { createCommitter } from "../../../src/committer/createCommitter.js";
import type { DurableMutationRecord } from "../../../src/state/types/durableMutation.js";
import type { SnapshotIntent } from "../../../src/state/types/snapshotIntent.js";
import type { CommitterDb } from "../../../src/types/committerDb.js";
import {
	createCustomerEntitlement,
	createState,
	createTrackMutation,
} from "../../fixtures/mutations.js";
import { createSubjectSnapshotsStore } from "../../fixtures/subjectSnapshotsStore.js";

const topic = "autumn-metering";
const retry = {
	degradedAfterAttempts: 1,
	initialBackoffMs: 1,
	maxBackoffMs: 1,
};
const PARTITION_COUNT = 64;
const MAX_BYTES = 262_144;
const BASELINE_AT = 1_699_999_000_000;

const identityOf = (customerId: string): MeteringIdentity => ({
	orgId: "org_1",
	env: "sandbox",
	customerId,
	entityId: null,
});
const keyOf = (customerId: string) =>
	meteringIdentityToPartitionKey({ identity: identityOf(customerId) });

/** Records every flush request; a flush refuses whatever `failWhen` names. */
const createRecordingDb = ({
	failWhen,
}: {
	failWhen?: (request: FlushRequest) => Error | null;
} = {}) => {
	const requests: FlushRequest[] = [];
	const db: CommitterDb = {
		readPartitionProgress: async () => null,
		insertPartitionProgress: async () => {},
		claimPartitionProgress: async () => {},
		flush: async (request) => {
			requests.push(request);
			const failure = failWhen?.(request);
			if (failure) throw failure;
			return { applied: request.changes.map(() => true) };
		},
	};
	return { db, requests };
};

const SNAPSHOTS = { partitionCount: PARTITION_COUNT };

const committerFor = ({
	db,
	snapshots = SNAPSHOTS,
	subjectSnapshots = createSubjectSnapshotsStore({
		mode: "write",
		maxBytes: MAX_BYTES,
	}),
	maxRowsPerFlush = 500,
	onSnapshotSizeCapped,
}: {
	db: CommitterDb;
	/** Null: the committer is not configured for snapshots at all. */
	snapshots?: { partitionCount: number } | null;
	/** Null: the worker registered no store, as a worker without edge configs. */
	subjectSnapshots?: ReturnType<typeof createSubjectSnapshotsStore> | null;
	maxRowsPerFlush?: number;
	onSnapshotSizeCapped?: (params: { customers: number }) => void;
}) =>
	createCommitter({
		ctx: {
			db,
			onSnapshotSizeCapped,
			...(subjectSnapshots && { subjectSnapshots }),
		},
		config: {
			concurrency: 1,
			maxRowsPerFlush,
			retry,
			...(snapshots && { snapshots }),
		},
	});

const trackRecord = ({
	customerId,
	offset,
	partition = 3,
	balance = 100,
}: {
	customerId: string;
	offset: bigint;
	partition?: number;
	balance?: number;
}): DurableMutationRecord => ({
	position: { topic, partition, offset },
	mutation: createTrackMutation({
		state: createState({ identity: identityOf(customerId), balance }),
		value: 5,
		commandId: `${customerId}_${offset}`,
	}),
});

/** The intent the writer would attach: the state each customer leaves, from a full read at BASELINE_AT. */
const writing = (...states: SubjectState[]): SnapshotIntent =>
	new Map(
		states.map((state) => [
			meteringIdentityToPartitionKey({ identity: state.identity }),
			{ states: [state], baselineAt: BASELINE_AT },
		]),
	);

const upsertedKeys = (request: FlushRequest | undefined) =>
	(request?.snapshots?.upserts ?? []).map(
		(row) => `${row.customerId}:${row.entityId ?? ""}`,
	);
const deletedCustomers = (request: FlushRequest | undefined) =>
	(request?.snapshots?.deletes ?? []).map((customer) => customer.customerId);

describe("committer subject snapshots", () => {
	test("without snapshots configured the flush statement is untouched, whatever the writer intended", async () => {
		const { db, requests } = createRecordingDb();
		const committer = committerFor({ db, snapshots: null });
		const state = createState({ identity: identityOf("cus_1"), balance: 95 });

		await committer.apply({
			topic,
			partition: 3,
			expectedOffset: 10n,
			records: [trackRecord({ customerId: "cus_1", offset: 10n })],
			snapshotIntent: writing(state),
		});

		expect(requests).toHaveLength(1);
		expect(requests[0]).not.toHaveProperty("snapshots");
	});

	test("with the store reading off, or no store at all, the flush statement is untouched, whatever the writer intended", async () => {
		const state = createState({ identity: identityOf("cus_1"), balance: 95 });
		for (const subjectSnapshots of [
			createSubjectSnapshotsStore({ mode: "off" }),
			null,
		]) {
			const { db, requests } = createRecordingDb();
			const committer = committerFor({ db, subjectSnapshots });
			await committer.apply({
				topic,
				partition: 3,
				expectedOffset: 10n,
				records: [trackRecord({ customerId: "cus_1", offset: 10n })],
				snapshotIntent: writing(state),
			});
			expect(requests).toHaveLength(1);
			expect(requests[0]).not.toHaveProperty("snapshots");
		}
	});

	test("a flip in the store takes effect at the next flush: off writes nothing, write upserts, off again writes nothing", async () => {
		const { db, requests } = createRecordingDb();
		const subjectSnapshots = createSubjectSnapshotsStore({ mode: "off" });
		const committer = committerFor({ db, subjectSnapshots });
		const state = createState({ identity: identityOf("cus_1"), balance: 95 });
		const applyAt = (offset: bigint) =>
			committer.apply({
				topic,
				partition: 3,
				expectedOffset: offset,
				records: [trackRecord({ customerId: "cus_1", offset })],
				snapshotIntent: writing(state),
			});

		await applyAt(10n);
		subjectSnapshots._setRuntimeConfigForTesting({
			...subjectSnapshots.get(),
			mode: "write",
		});
		await applyAt(11n);
		subjectSnapshots._setRuntimeConfigForTesting({
			...subjectSnapshots.get(),
			mode: "off",
		});
		await applyAt(12n);

		expect(requests.map(upsertedKeys)).toEqual([[], ["cus_1:"], []]);
		expect(requests[0]).not.toHaveProperty("snapshots");
		expect(requests[2]).not.toHaveProperty("snapshots");
	});

	test("the size cap is the store's, read at the flush", async () => {
		const { db, requests } = createRecordingDb();
		const subjectSnapshots = createSubjectSnapshotsStore({
			mode: "write",
			maxBytes: 64,
		});
		const committer = committerFor({ db, subjectSnapshots });
		const state = createState({ identity: identityOf("cus_1") });

		await committer.apply({
			topic,
			partition: 3,
			expectedOffset: 10n,
			records: [trackRecord({ customerId: "cus_1", offset: 10n })],
			snapshotIntent: writing(state),
		});
		expect(deletedCustomers(requests[0])).toEqual(["cus_1"]);

		subjectSnapshots._setRuntimeConfigForTesting({
			...subjectSnapshots.get(),
			maxBytes: MAX_BYTES,
		});
		await committer.apply({
			topic,
			partition: 3,
			expectedOffset: 11n,
			records: [trackRecord({ customerId: "cus_1", offset: 11n })],
			snapshotIntent: writing(state),
		});
		expect(upsertedKeys(requests[1])).toEqual(["cus_1:"]);
	});

	test("a customer the writer vouched for is upserted: each state a row, keyed and partitioned as held, aged by its full read", async () => {
		const { db, requests } = createRecordingDb();
		const committer = committerFor({ db });
		const state = createState({ identity: identityOf("cus_1"), balance: 95 });

		await committer.apply({
			topic,
			partition: 3,
			expectedOffset: 10n,
			records: [trackRecord({ customerId: "cus_1", offset: 10n })],
			snapshotIntent: writing(state),
		});

		const [upsert] = requests[0]?.snapshots?.upserts ?? [];
		expect(requests[0]?.snapshots?.deletes).toEqual([]);
		expect(upsert).toMatchObject({
			orgId: "org_1",
			env: "sandbox",
			customerId: "cus_1",
			entityId: null,
			internalCustomerId: state.customer.internal_id,
			partition: 3,
			partitionCount: PARTITION_COUNT,
			stateVersion: BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION,
			baselineAt: BASELINE_AT,
			logOffset: 10n,
		});
		expect(JSON.parse(upsert?.stateJson ?? "{}")).toEqual(state);
	});

	test("a customer the writer could not vouch for is deleted; others in the flush still upsert; a replay with no intent writes nothing", async () => {
		const { db, requests } = createRecordingDb();
		const committer = committerFor({ db });
		const kept = createState({ identity: identityOf("cus_kept"), balance: 1 });

		await committer.apply({
			topic,
			partition: 3,
			expectedOffset: 10n,
			records: [
				trackRecord({ customerId: "cus_gone", offset: 10n }),
				trackRecord({ customerId: "cus_kept", offset: 11n }),
			],
			snapshotIntent: new Map([
				[keyOf("cus_gone"), "delete"],
				...writing(kept),
			]),
		});
		await committer.apply({
			topic,
			partition: 3,
			expectedOffset: 12n,
			records: [trackRecord({ customerId: "cus_replayed", offset: 12n })],
		});

		expect(deletedCustomers(requests[0])).toEqual(["cus_gone"]);
		expect(requests[0]?.snapshots?.deletes[0]).toMatchObject({
			orgId: "org_1",
			env: "sandbox",
		});
		expect(upsertedKeys(requests[0])).toEqual(["cus_kept:"]);
		expect(requests[1]).not.toHaveProperty("snapshots");
	});

	test("a state over the size cap deletes its customer instead, and is counted once the flush lands, not per attempt", async () => {
		let transientFailures = 1;
		const { db, requests } = createRecordingDb({
			failWhen: () =>
				transientFailures-- > 0
					? Object.assign(new Error("connection reset"), { errno: "08006" })
					: null,
		});
		const capped: number[] = [];
		const committer = committerFor({
			db,
			onSnapshotSizeCapped: ({ customers }) => capped.push(customers),
		});
		const huge = createState({
			identity: identityOf("cus_huge"),
			customerEntitlements: [
				createCustomerEntitlement({ id: "x".repeat(MAX_BYTES) }),
			],
		});
		const small = createState({ identity: identityOf("cus_small") });

		await committer.apply({
			topic,
			partition: 3,
			expectedOffset: 10n,
			records: [
				trackRecord({ customerId: "cus_huge", offset: 10n }),
				trackRecord({ customerId: "cus_small", offset: 11n }),
			],
			snapshotIntent: writing(huge, small),
		});

		expect(requests).toHaveLength(2);
		expect(deletedCustomers(requests[1])).toEqual(["cus_huge"]);
		expect(upsertedKeys(requests[1])).toEqual(["cus_small:"]);
		expect(capped).toEqual([1]);
	});

	test("past the flush's serialised budget the remaining customers delete instead of write, and are counted", async () => {
		const { db, requests } = createRecordingDb();
		const capped: number[] = [];
		const committer = committerFor({
			db,
			subjectSnapshots: createSubjectSnapshotsStore({
				mode: "write",
				maxFlushBytes: 1,
			}),
			onSnapshotSizeCapped: ({ customers }) => capped.push(customers),
		});

		await committer.apply({
			topic,
			partition: 3,
			expectedOffset: 10n,
			records: [
				trackRecord({ customerId: "cus_first", offset: 10n }),
				trackRecord({ customerId: "cus_second", offset: 11n }),
				trackRecord({ customerId: "cus_third", offset: 12n }),
			],
			snapshotIntent: writing(
				createState({ identity: identityOf("cus_first") }),
				createState({ identity: identityOf("cus_second") }),
				createState({ identity: identityOf("cus_third") }),
			),
		});

		expect(upsertedKeys(requests[0])).toEqual(["cus_first:"]);
		expect(deletedCustomers(requests[0])).toEqual(["cus_second", "cus_third"]);
		expect(capped).toEqual([2]);
	});

	test("a flush that times out twice with its snapshots attached lands on the third attempt with the customers' snapshots deleted, and never refuses a record", async () => {
		let attempts = 0;
		const { db, requests } = createRecordingDb({
			failWhen: (request) => {
				attempts += 1;
				return (request.snapshots?.upserts.length ?? 0) > 0
					? Object.assign(
							new Error("canceling statement due to statement timeout"),
							{
								errno: "57014",
							},
						)
					: null;
			},
		});
		const committer = committerFor({ db });

		const outcome = await committer.apply({
			topic,
			partition: 3,
			expectedOffset: 10n,
			records: [trackRecord({ customerId: "cus_big", offset: 10n })],
			snapshotIntent: writing(createState({ identity: identityOf("cus_big") })),
		});

		expect(outcome).toEqual({ nextOffset: 11n });
		expect(attempts).toBe(3);
		expect(requests.slice(0, 2).map((r) => upsertedKeys(r))).toEqual([
			["cus_big:"],
			["cus_big:"],
		]);
		expect(deletedCustomers(requests[2])).toEqual(["cus_big"]);
		expect(requests[2]?.changes).toHaveLength(1);
	});

	test("a flush that fails lands call by call: the call whose snapshot is the reason lands its records with the customer deleted, and no record is refused", async () => {
		const poisonId = "ce_poison";
		const { db, requests } = createRecordingDb({
			failWhen: (request) =>
				request.snapshots?.upserts.some((row) =>
					row.stateJson.includes(poisonId),
				)
					? new Error(
							'insert or update on table "subject_snapshots" violates foreign key constraint',
						)
					: null,
		});
		const committer = committerFor({ db });
		const poison = createState({
			identity: identityOf("cus_x"),
			customerEntitlements: [createCustomerEntitlement({ id: poisonId })],
		});
		const fine = createState({ identity: identityOf("cus_a") });
		// The lane is busy with a held flush while both calls queue, so they land in one flush together.
		const gate = Promise.withResolvers<void>();
		const flush = db.flush;
		db.flush = async (request) => {
			await gate.promise;
			return flush(request);
		};
		const held = committer.apply({
			topic,
			partition: 0,
			expectedOffset: 0n,
			records: [trackRecord({ customerId: "cus_0", offset: 0n, partition: 0 })],
		});

		const landing = Promise.all([
			committer.apply({
				topic,
				partition: 1,
				expectedOffset: 10n,
				records: [
					trackRecord({ customerId: "cus_a", offset: 10n, partition: 1 }),
				],
				snapshotIntent: writing(fine),
			}),
			committer.apply({
				topic,
				partition: 2,
				expectedOffset: 20n,
				records: [
					trackRecord({ customerId: "cus_x", offset: 20n, partition: 2 }),
				],
				snapshotIntent: writing(poison),
			}),
		]);
		gate.resolve();
		await held;
		const [a, x] = await landing;

		expect(a).toEqual({ nextOffset: 11n });
		expect(x).toEqual({ nextOffset: 21n });
		const shared = requests[1];
		expect(shared?.bookmarks.map((b) => b.partition)).toEqual([1, 2]);
		expect(upsertedKeys(shared)).toEqual(["cus_a:", "cus_x:"]);
		const landedA = requests
			.slice(2)
			.filter((r) => upsertedKeys(r).includes("cus_a:"));
		expect(landedA).toHaveLength(1);
		expect(landedA[0]?.bookmarks.map((b) => b.partition)).toEqual([1]);
		const landedX = requests.filter((r) =>
			deletedCustomers(r).includes("cus_x"),
		);
		expect(landedX).toHaveLength(1);
		expect(landedX[0]?.bookmarks.map((b) => b.partition)).toEqual([2]);
	});

	test("landing piece by piece deletes every customer of the call: a record alone no longer lands with the rest of its customer's", async () => {
		const poisonId = "cp_poison";
		const { db, requests } = createRecordingDb({
			failWhen: (request) =>
				request.changes.some(
					(change: SubjectRowChange) =>
						change.op === "update" && change.id === poisonId,
				)
					? new Error("value too long for type character varying(64)")
					: null,
		});
		const committer = committerFor({ db });
		const poison = trackRecord({ customerId: "cus_poison", offset: 11n });
		poison.mutation.changes = poison.mutation.changes.map((change) => ({
			...change,
			id: poisonId,
		}));
		const states = ["cus_a", "cus_poison", "cus_b"].map((customerId) =>
			createState({ identity: identityOf(customerId) }),
		);

		const outcome = await committer.apply({
			topic,
			partition: 3,
			expectedOffset: 10n,
			records: [
				trackRecord({ customerId: "cus_a", offset: 10n }),
				poison,
				trackRecord({ customerId: "cus_b", offset: 12n }),
			],
			snapshotIntent: writing(...states),
		});

		expect(outcome.nextOffset).toBe(13n);
		expect(outcome.rejections?.map(({ record }) => record)).toEqual([poison]);
		expect(upsertedKeys(requests[0])).toEqual([
			"cus_a:",
			"cus_poison:",
			"cus_b:",
		]);
		for (const request of requests.slice(1))
			expect(upsertedKeys(request)).toEqual([]);
		expect(
			new Set(
				requests.slice(1).flatMap((request) => deletedCustomers(request)),
			),
		).toEqual(new Set(["cus_a", "cus_poison", "cus_b"]));
	});

	test("snapshot rows count toward the flush's row cap only while snapshots are written", async () => {
		const flushesOf = async (
			subjectSnapshots: ReturnType<typeof createSubjectSnapshotsStore> | null,
		) => {
			const { db, requests } = createRecordingDb();
			const committer = committerFor({
				db,
				subjectSnapshots,
				maxRowsPerFlush: 3,
			});
			let release: () => void = () => {};
			const gate = new Promise<void>((resolve) => {
				release = resolve;
			});
			const flush = db.flush;
			db.flush = async (request) => {
				await gate;
				return flush(request);
			};
			const first = committer.apply({
				topic,
				partition: 0,
				expectedOffset: 0n,
				records: [
					trackRecord({ customerId: "cus_0", offset: 0n, partition: 0 }),
				],
			});
			const queued = [1, 2].map((partition) =>
				committer.apply({
					topic,
					partition,
					expectedOffset: 0n,
					records: [
						trackRecord({
							customerId: `cus_${partition}`,
							offset: 0n,
							partition,
						}),
					],
					snapshotIntent: writing(
						createState({ identity: identityOf(`cus_${partition}`) }),
					),
				}),
			);
			release();
			await Promise.all([first, ...queued]);
			return requests.length;
		};
		// Each record is one row change plus one snapshot row: at a cap of 3 the two queued calls no longer share a flush.
		expect(await flushesOf(null)).toBe(2);
		expect(await flushesOf(createSubjectSnapshotsStore({ mode: "off" }))).toBe(
			2,
		);
		expect(
			await flushesOf(createSubjectSnapshotsStore({ mode: "write" })),
		).toBe(3);
	});
});
