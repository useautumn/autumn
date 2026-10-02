import { describe, expect, test } from "bun:test";
import type { FlushRequest } from "@autumn/postgres";
import { createCommitter } from "../../../src/committer/createCommitter.js";
import { createCommitterStateStore } from "../../../src/committer/createCommitterStateStore.js";
import {
	defaultSubjectSnapshotsEdgeConfig,
	type SubjectSnapshotMode,
} from "../../../src/edgeConfig/subjectSnapshotsEdgeConfig.js";
import type { CommitterDb } from "../../../src/types/committerDb.js";
import { createState, createTrackMutation } from "../../fixtures/mutations.js";

const topic = "autumn-metering";
const retry = {
	degradedAfterAttempts: 1,
	initialBackoffMs: 1,
	maxBackoffMs: 1,
};

/** A Postgres stand-in that counts statements; `gate` holds every flush until it resolves. */
const createCountingDb = ({
	gate = Promise.resolve(),
	failDrops = false,
}: {
	gate?: Promise<unknown>;
	failDrops?: boolean;
} = {}) => {
	const requests: FlushRequest[] = [];
	const claimTokens: string[] = [];
	const db: CommitterDb = {
		readPartitionProgress: async () => null,
		insertPartitionProgress: async () => {},
		claimPartitionProgress: async ({ claimToken }) => {
			claimTokens.push(claimToken);
		},
		flush: async (request) => {
			requests.push(request);
			await gate;
			if (failDrops && (request.snapshots?.deletes.length ?? 0) > 0)
				throw new Error("relation subject_snapshots does not exist");
			return { applied: request.changes.map(() => true) };
		},
	};
	const dropStatements = () =>
		requests.filter((request) => (request.snapshots?.deletes.length ?? 0) > 0);
	return { db, requests, claimTokens, dropStatements };
};

const createStore = ({
	db,
	mode = "write",
}: {
	db: CommitterDb;
	mode?: SubjectSnapshotMode;
}) => {
	const snapshots = {
		read: () => ({ ...defaultSubjectSnapshotsEdgeConfig(), mode }),
	};
	return createCommitterStateStore({
		ctx: {
			committer: createCommitter({
				ctx: { db },
				config: {
					concurrency: 32,
					maxRowsPerFlush: 500,
					retry,
					snapshots: { ...snapshots, partitionCount: 64 },
				},
			}),
			db,
		},
		config: { subjectSnapshots: snapshots },
	});
};

const customerOf = (index: number) => ({
	orgId: "org_1",
	env: "sandbox",
	customerId: `cus_${index}`,
});

describe("committer state store snapshot drops", () => {
	test("the store says whether snapshots are written right now, from the control it was given", () => {
		const { db } = createCountingDb();
		expect(createStore({ db, mode: "off" }).subjectSnapshots?.written()).toBe(
			false,
		);
		expect(createStore({ db }).subjectSnapshots?.written()).toBe(true);
	});

	test("drops asked for in one tick land as one DELETE, and each caller resolves once it commits", async () => {
		const { db, requests } = createCountingDb();
		const store = createStore({ db });
		const drops = store.subjectSnapshots;
		if (!drops) throw new Error("expected snapshot drops");

		await Promise.all(
			[1, 2, 3, 2].map((index) =>
				drops.dropCustomer({
					topic,
					partition: 4,
					customer: customerOf(index),
				}),
			),
		);

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

	test("an evict storm of 10,000 in one tick on one partition is ceil(10,000 / batch) DELETEs, never one per evict", async () => {
		const { db, dropStatements } = createCountingDb();
		const store = createStore({ db });
		const drops = store.subjectSnapshots;
		if (!drops) throw new Error("expected snapshot drops");

		await Promise.all(
			Array.from({ length: 10_000 }, (_, index) =>
				drops.dropCustomer({
					topic,
					partition: 4,
					customer: customerOf(index),
				}),
			),
		);

		const statements = dropStatements();
		expect(statements).toHaveLength(
			Math.ceil(10_000 / defaultSubjectSnapshotsEdgeConfig().dropBatch),
		);
		expect(
			statements.reduce(
				(total, request) => total + (request.snapshots?.deletes.length ?? 0),
				0,
			),
		).toBe(10_000);
	});

	test("a storm spread over partitions batches per partition", async () => {
		const { db, dropStatements } = createCountingDb();
		const store = createStore({ db });
		const drops = store.subjectSnapshots;
		if (!drops) throw new Error("expected snapshot drops");

		await Promise.all(
			Array.from({ length: 10_000 }, (_, index) =>
				drops.dropCustomer({
					topic,
					partition: index % 4,
					customer: customerOf(index),
				}),
			),
		);

		// 2,500 per partition: ceil(2,500 / 500) each.
		expect(dropStatements()).toHaveLength(4 * 5);
	});

	test("a drop waits behind the partition's apply already in flight: Postgres order is lane order", async () => {
		const held = Promise.withResolvers<void>();
		const { db, requests } = createCountingDb({ gate: held.promise });
		const store = createStore({ db });
		await store.initializePartition({ topic, partition: 4, nextOffset: 0n });
		const drops = store.subjectSnapshots;
		if (!drops) throw new Error("expected snapshot drops");
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
		const dropped = drops.dropCustomer({
			topic,
			partition: 4,
			customer: customerOf(99),
		});
		await Bun.sleep(5);

		// Only the apply's flush has reached Postgres; the drop waits for it to settle.
		expect(requests).toHaveLength(1);
		expect(requests[0]?.snapshots?.deletes).not.toContainEqual(customerOf(99));
		held.resolve();
		await Promise.all([applied, dropped]);
		expect(requests.at(-1)?.snapshots?.deletes).toEqual([customerOf(99)]);
	});

	test("a drop that cannot land rejects every caller in its batch, so their evicts fail and are retried", async () => {
		const { db } = createCountingDb({ failDrops: true });
		const store = createStore({ db });
		const drops = store.subjectSnapshots;
		if (!drops) throw new Error("expected snapshot drops");

		const outcomes = await Promise.allSettled(
			[1, 2].map((index) =>
				drops.dropCustomer({
					topic,
					partition: 4,
					customer: customerOf(index),
				}),
			),
		);

		expect(outcomes.map((outcome) => outcome.status)).toEqual([
			"rejected",
			"rejected",
		]);
	});

	test("a drop lands under the claim the partition holds, with no bookmark to move", async () => {
		const { db, requests, claimTokens } = createCountingDb();
		const store = createStore({ db });
		await store.claimPartition({ topic, partition: 4 });
		const drops = store.subjectSnapshots;
		if (!drops) throw new Error("expected snapshot drops");

		await drops.dropCustomer({ topic, partition: 4, customer: customerOf(1) });

		const [claimToken] = claimTokens;
		expect(claimToken).toBeString();
		expect(requests).toEqual([
			{
				changes: [],
				bookmarks: [],
				snapshots: {
					upserts: [],
					deletes: [
						{
							...customerOf(1),
							claim: { topic, partition: 4, claimToken },
						},
					],
				},
			},
		]);
	});

	test("a queued drop keeps the claim it was asked under when the partition is claimed again before it lands", async () => {
		const held = Promise.withResolvers<void>();
		const { db, requests, claimTokens } = createCountingDb({
			gate: held.promise,
		});
		const store = createStore({ db });
		await store.initializePartition({ topic, partition: 4, nextOffset: 0n });
		await store.claimPartition({ topic, partition: 4 });
		const drops = store.subjectSnapshots;
		if (!drops) throw new Error("expected snapshot drops");

		const applied = store.applyDurableMutations({
			records: [
				{
					position: { topic, partition: 4, offset: 0n },
					mutation: createTrackMutation({
						state: createState({ balance: 100 }),
						value: 5,
					}),
				},
			],
		});
		await Bun.sleep(1);
		const queued = drops.dropCustomer({
			topic,
			partition: 4,
			customer: customerOf(21),
		});
		await Bun.sleep(1);
		await store.claimPartition({ topic, partition: 4 });
		held.resolve();
		await Promise.all([applied, queued]);
		await drops.dropCustomer({ topic, partition: 4, customer: customerOf(22) });

		const [first, second] = claimTokens;
		expect(first).not.toBe(second);
		expect(
			requests
				.filter((request) => request.changes.length === 0)
				.map((request) => request.snapshots?.deletes),
		).toEqual([
			[
				{
					...customerOf(21),
					claim: { topic, partition: 4, claimToken: first },
				},
			],
			[
				{
					...customerOf(22),
					claim: { topic, partition: 4, claimToken: second },
				},
			],
		]);
	});

	test("drops waiting under different claims land as separate DELETEs, each under its own claim", async () => {
		const held = Promise.withResolvers<void>();
		const { db, requests, claimTokens } = createCountingDb({
			gate: held.promise,
		});
		const store = createStore({ db });
		await store.initializePartition({ topic, partition: 4, nextOffset: 0n });
		await store.claimPartition({ topic, partition: 4 });
		const drops = store.subjectSnapshots;
		if (!drops) throw new Error("expected snapshot drops");

		const applied = store.applyDurableMutations({
			records: [
				{
					position: { topic, partition: 4, offset: 0n },
					mutation: createTrackMutation({
						state: createState({ balance: 100 }),
						value: 5,
					}),
				},
			],
		});
		await Bun.sleep(1);
		const first = drops.dropCustomer({
			topic,
			partition: 4,
			customer: customerOf(21),
		});
		await store.claimPartition({ topic, partition: 4 });
		const second = drops.dropCustomer({
			topic,
			partition: 4,
			customer: customerOf(22),
		});
		held.resolve();
		await Promise.all([applied, first, second]);

		expect(
			requests
				.filter((request) => request.changes.length === 0)
				.map((request) =>
					request.snapshots?.deletes.map((drop) => [
						drop.customerId,
						drop.claim?.claimToken,
					]),
				),
		).toEqual([[["cus_21", claimTokens[0]]], [["cus_22", claimTokens[1]]]]);
	});
});
