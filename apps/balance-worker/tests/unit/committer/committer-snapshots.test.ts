import { describe, expect, test } from "bun:test";
import type { MeteringIdentity, SubjectState } from "@autumn/balance-engine";
import { BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION } from "@autumn/env/balanceWorkerConstants";
import type { FlushRequest, SubjectRowChange } from "@autumn/postgres";
import { createEvictRecord } from "../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { createCommitter } from "../../../src/committer/createCommitter.js";
import {
	defaultSubjectSnapshotsEdgeConfig,
	type SubjectSnapshotMode,
} from "../../../src/edgeConfig/subjectSnapshotsEdgeConfig.js";
import type { DurableMutationRecord } from "../../../src/state/types/durableMutation.js";
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
const BASELINE_AT = 1_699_999_000_000;

const identityOf = ({
	customerId,
	entityId = null,
}: {
	customerId: string;
	entityId?: string | null;
}): MeteringIdentity => ({
	orgId: "org_1",
	env: "sandbox",
	customerId,
	entityId,
});

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

const committerFor = ({
	db,
	mode = "write",
	maxRowsPerFlush = 500,
	onSnapshotSizeCapped,
}: {
	db: CommitterDb;
	mode?: SubjectSnapshotMode;
	maxRowsPerFlush?: number;
	onSnapshotSizeCapped?: (params: { customers: number }) => void;
}) =>
	createCommitter({
		ctx: {
			db,
			onSnapshotSizeCapped,
			subjectSnapshots: createSubjectSnapshotsStore({ mode }),
		},
		config: {
			concurrency: 1,
			maxRowsPerFlush,
			retry,
			snapshots: { partitionCount: PARTITION_COUNT },
		},
	});

/** A track of `customerId` at `offset`; `snapshot` attaches what the writer would: the subject's state after it. */
const trackRecord = ({
	customerId,
	offset,
	partition = 3,
	snapshot = true,
	balance = 100,
}: {
	customerId: string;
	offset: bigint;
	partition?: number;
	snapshot?: boolean;
	balance?: number;
}): DurableMutationRecord => {
	const state = createState({
		identity: identityOf({ customerId }),
		balance,
	});
	return {
		position: { topic, partition, offset },
		mutation: createTrackMutation({
			state,
			value: 5,
			commandId: `${customerId}_${offset}`,
		}),
		...(snapshot
			? { snapshots: [{ state, baselineAt: BASELINE_AT }] }
			: undefined),
	};
};

const customerOf = (customerId: string) => ({
	orgId: "org_1",
	env: "sandbox",
	customerId,
});

const upsertedKeys = (request: FlushRequest | undefined) =>
	(request?.snapshots?.upserts ?? []).map(
		(row) => `${row.customerId}:${row.entityId ?? ""}`,
	);

const deletedCustomers = (request: FlushRequest | undefined) =>
	(request?.snapshots?.deletes ?? []).map((customer) => customer.customerId);

describe("committer subject snapshots", () => {
	test("mode off writes no snapshot SQL, whatever the records carry", async () => {
		const { db, requests } = createRecordingDb();
		const committer = committerFor({ db, mode: "off" });

		await committer.apply({
			topic,
			partition: 3,
			expectedOffset: 10n,
			records: [
				trackRecord({ customerId: "cus_a", offset: 10n }),
				trackRecord({ customerId: "cus_b", offset: 11n, snapshot: false }),
			],
		});

		expect(requests).toHaveLength(1);
		expect(requests[0]?.snapshots).toBeUndefined();
	});

	test("a record the writer attached state to upserts every subject it carries, keyed and partitioned as held", async () => {
		const { db, requests } = createRecordingDb();
		const committer = committerFor({ db });
		const record = trackRecord({ customerId: "cus_a", offset: 10n });

		await committer.apply({
			topic,
			partition: 3,
			expectedOffset: 10n,
			records: [record],
		});

		const [upsert] = requests[0]?.snapshots?.upserts ?? [];
		const state = record.snapshots?.[0]?.state as SubjectState;
		expect(requests[0]?.snapshots?.deletes).toEqual([]);
		const { stateJson, ...columns } = upsert ?? { stateJson: "null" };
		expect(columns).toEqual({
			orgId: "org_1",
			env: "sandbox",
			customerId: "cus_a",
			entityId: null,
			internalCustomerId: state.customer.internal_id,
			internalEntityId: null,
			partition: 3,
			partitionCount: PARTITION_COUNT,
			stateVersion: BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION,
			baselineAt: BASELINE_AT,
			logOffset: 10n,
		});
		expect(JSON.parse(stateJson)).toEqual(JSON.parse(JSON.stringify(state)));
	});

	test("a record with no state (replay, a logged evict) deletes its customer's rows", async () => {
		const { db, requests } = createRecordingDb();
		const committer = committerFor({ db });

		await committer.apply({
			topic,
			partition: 3,
			expectedOffset: 10n,
			records: [
				trackRecord({ customerId: "cus_a", offset: 10n, snapshot: false }),
				{
					position: { topic, partition: 3, offset: 11n },
					mutation: createEvictRecord(),
				},
			],
		});

		expect(upsertedKeys(requests[0])).toEqual([]);
		expect(requests[0]?.snapshots?.deletes).toEqual([
			customerOf("cus_a"),
			customerOf(createEvictRecord().identity.customerId),
		]);
	});

	test("a customer with any record lacking state is deleted, never upserted; other customers still upsert", async () => {
		const { db, requests } = createRecordingDb();
		const committer = committerFor({ db });

		await committer.apply({
			topic,
			partition: 3,
			expectedOffset: 10n,
			records: [
				trackRecord({ customerId: "cus_a", offset: 10n }),
				trackRecord({ customerId: "cus_a", offset: 11n, snapshot: false }),
				trackRecord({ customerId: "cus_a", offset: 12n }),
				trackRecord({ customerId: "cus_b", offset: 13n }),
			],
		});

		expect(upsertedKeys(requests[0])).toEqual(["cus_b:"]);
		expect(deletedCustomers(requests[0])).toEqual(["cus_a"]);
	});

	test("the same subject twice in a flush upserts once, with the last state", async () => {
		const { db, requests } = createRecordingDb();
		const committer = committerFor({ db });

		await committer.apply({
			topic,
			partition: 3,
			expectedOffset: 10n,
			records: [
				trackRecord({ customerId: "cus_a", offset: 10n, balance: 90 }),
				trackRecord({ customerId: "cus_a", offset: 11n, balance: 80 }),
			],
		});

		const upserts = requests[0]?.snapshots?.upserts ?? [];
		expect(upserts).toHaveLength(1);
		expect(upserts[0]?.logOffset).toBe(11n);
		expect(
			JSON.parse(upserts[0]?.stateJson ?? "null").customerEntitlements[0]
				.balance,
		).toBe(80);
	});

	test("a customer and its entity are separate rows of one upsert", async () => {
		const { db, requests } = createRecordingDb();
		const committer = committerFor({ db });
		const record = trackRecord({ customerId: "cus_a", offset: 10n });
		const customerState = record.snapshots?.[0]?.state as SubjectState;
		const entityState: SubjectState = {
			...customerState,
			identity: identityOf({ customerId: "cus_a", entityId: "seat_1" }),
			entity: {
				id: "seat_1",
				internal_id: "ent_internal_1",
				internal_customer_id: customerState.customer.internal_id,
				feature_id: "seats",
				internal_feature_id: "feat_seats",
			},
		};

		await committer.apply({
			topic,
			partition: 3,
			expectedOffset: 10n,
			records: [
				{
					...record,
					snapshots: [
						{ state: customerState, baselineAt: BASELINE_AT },
						{ state: entityState, baselineAt: BASELINE_AT },
					],
				},
			],
		});

		expect(
			(requests[0]?.snapshots?.upserts ?? []).map((row) => [
				row.entityId,
				row.internalEntityId,
			]),
		).toEqual([
			[null, null],
			["seat_1", "ent_internal_1"],
		]);
	});

	test("a state over the size cap deletes its customer instead, and is counted", async () => {
		const { db, requests } = createRecordingDb();
		const capped: number[] = [];
		const committer = committerFor({
			db,
			onSnapshotSizeCapped: ({ customers }) => capped.push(customers),
		});
		const huge = trackRecord({ customerId: "cus_huge", offset: 10n });
		const hugeState = huge.snapshots?.[0]?.state as SubjectState;
		const padded: SubjectState = {
			...hugeState,
			customerEntitlements: [
				...hugeState.customerEntitlements,
				...Array.from({ length: 1_200 }, (_, index) =>
					createCustomerEntitlement({
						id: `pad_${index}_${"x".repeat(200)}`,
						featureId: "messages",
						balance: index,
					}),
				),
			],
		};
		expect(JSON.stringify(padded).length).toBeGreaterThan(
			defaultSubjectSnapshotsEdgeConfig().maxBytes,
		);

		await committer.apply({
			topic,
			partition: 3,
			expectedOffset: 10n,
			records: [
				{ ...huge, snapshots: [{ state: padded, baselineAt: BASELINE_AT }] },
				trackRecord({ customerId: "cus_b", offset: 11n }),
			],
		});

		expect(upsertedKeys(requests[0])).toEqual(["cus_b:"]);
		expect(deletedCustomers(requests[0])).toEqual(["cus_huge"]);
		expect(capped).toEqual([1]);
	});

	test("a plan that inserts a customer or entity row deletes the customer's snapshot rather than upserting it", async () => {
		const { db, requests } = createRecordingDb();
		const committer = committerFor({ db });
		const record = trackRecord({ customerId: "cus_a", offset: 10n });
		const entityInsert = {
			table: "entity",
			op: "insert",
			row: { internal_id: "ent_new", id: "seat_new" },
		} as unknown as (typeof record.mutation.changes)[number];

		await committer.apply({
			topic,
			partition: 3,
			expectedOffset: 10n,
			records: [
				{
					...record,
					mutation: {
						...record.mutation,
						command: {
							...record.mutation.command,
							type: "applyBillingPlan",
						} as typeof record.mutation.command,
						changes: [entityInsert],
					},
				},
			],
		});

		expect(upsertedKeys(requests[0])).toEqual([]);
		expect(deletedCustomers(requests[0])).toEqual(["cus_a"]);
	});

	test("a flush that fails with snapshots aboard is tried once without them, so a snapshot never costs a record", async () => {
		const fkViolation = Object.assign(
			new Error(
				'insert or update on table "subject_snapshots" violates foreign key constraint',
			),
			{ errno: "23503" },
		);
		const { db, requests } = createRecordingDb({
			failWhen: (request) =>
				(request.snapshots?.upserts.length ?? 0) > 0 ? fkViolation : null,
		});
		const committer = committerFor({ db });

		const outcome = await committer.apply({
			topic,
			partition: 3,
			expectedOffset: 10n,
			records: [trackRecord({ customerId: "cus_a", offset: 10n })],
		});

		expect(outcome).toEqual({ nextOffset: 11n });
		expect(requests).toHaveLength(2);
		expect(upsertedKeys(requests[1])).toEqual([]);
		expect(deletedCustomers(requests[1])).toEqual(["cus_a"]);
		expect(requests[1]?.changes).toEqual(requests[0]?.changes);
	});

	test("landing piece by piece, or skipping a refused record, deletes every customer it carries and never upserts", async () => {
		const poisonId = "poison";
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

		const outcome = await committer.apply({
			topic,
			partition: 3,
			expectedOffset: 10n,
			records: [
				trackRecord({ customerId: "cus_a", offset: 10n }),
				poison,
				trackRecord({ customerId: "cus_b", offset: 12n }),
			],
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
			requests.slice(1).flatMap((request) => deletedCustomers(request)),
		).toEqual(expect.arrayContaining(["cus_a", "cus_poison", "cus_b"]));
	});

	test("an evict's snapshot drop lands with no bookmark, beside whatever else the flush carries", async () => {
		const { db, requests } = createRecordingDb();
		const committer = committerFor({ db });

		const [drop] = await Promise.all([
			committer.apply({
				topic,
				partition: 3,
				expectedOffset: 0n,
				records: [],
				snapshotDrops: [customerOf("cus_x"), customerOf("cus_y")],
			}),
		]);

		expect(drop).toEqual({ nextOffset: 0n });
		expect(requests).toEqual([
			{
				changes: [],
				bookmarks: [],
				snapshots: {
					upserts: [],
					deletes: [customerOf("cus_x"), customerOf("cus_y")],
				},
			},
		]);
	});

	test("a snapshot drop that cannot land rejects its caller", async () => {
		const { db } = createRecordingDb({
			failWhen: () => new Error("relation subject_snapshots does not exist"),
		});
		const committer = committerFor({ db });

		await expect(
			committer.apply({
				topic,
				partition: 3,
				expectedOffset: 0n,
				records: [],
				snapshotDrops: [customerOf("cus_x")],
			}),
		).rejects.toThrow("subject_snapshots does not exist");
	});

	test("a snapshot drop that cannot land rejects only its caller: the record call sharing its flush still gets its outcome", async () => {
		const { db, requests } = createRecordingDb({
			failWhen: (request) =>
				request.snapshots?.deletes.some((c) => c.customerId === "cus_x")
					? new Error("relation subject_snapshots does not exist")
					: null,
		});
		const committer = committerFor({ db });
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
			records: [trackRecord({ customerId: "cus_0", offset: 0n, partition: 0 })],
		});
		const record = committer.apply({
			topic,
			partition: 1,
			expectedOffset: 4n,
			records: [trackRecord({ customerId: "cus_1", offset: 4n, partition: 1 })],
		});
		const drop = committer.apply({
			topic,
			partition: 2,
			expectedOffset: 0n,
			records: [],
			snapshotDrops: [customerOf("cus_x")],
		});
		release();

		await first;
		await expect(drop).rejects.toThrow("subject_snapshots does not exist");
		expect(await record).toMatchObject({ nextOffset: 5n });
		const landed = [...requests]
			.reverse()
			.find((request) =>
				request.bookmarks.some((bookmark) => bookmark.partition === 1),
			);
		expect(deletedCustomers(landed)).toEqual(["cus_1"]);
	});

	test("snapshot rows count toward the flush's row cap only when snapshots are written", async () => {
		const flushesOf = async (mode: SubjectSnapshotMode) => {
			const { db, requests } = createRecordingDb();
			const committer = committerFor({ db, mode, maxRowsPerFlush: 3 });
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
				}),
			);
			release();
			await Promise.all([first, ...queued]);
			return requests.map((request) => request.bookmarks.length);
		};

		// Each track is one row change; with its snapshot it is two, so the queued pair no longer fits under three.
		expect(await flushesOf("off")).toEqual([1, 2]);
		expect(await flushesOf("write")).toEqual([1, 1, 1]);
	});
});
