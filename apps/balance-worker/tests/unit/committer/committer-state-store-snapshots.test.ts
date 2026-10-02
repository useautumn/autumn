import { describe, expect, test } from "bun:test";
import { meteringIdentityToPartitionKey } from "@autumn/balance-engine";
import type { FlushRequest } from "@autumn/postgres";
import { createCommitter } from "../../../src/committer/createCommitter.js";
import { createCommitterStateStore } from "../../../src/committer/createCommitterStateStore.js";
import type { CommitterDb } from "../../../src/types/committerDb.js";
import { createState, createTrackMutation } from "../../fixtures/mutations.js";

const topic = "autumn-metering";
const retry = {
	degradedAfterAttempts: 1,
	initialBackoffMs: 1,
	maxBackoffMs: 1,
};
const DROP_BATCH = 500;

/** A Postgres stand-in that counts statements; `gate` holds every flush until it resolves. */
const createCountingDb = ({
	gate = Promise.resolve(),
	failDeletes = false,
}: {
	gate?: Promise<unknown>;
	failDeletes?: boolean;
} = {}) => {
	const requests: FlushRequest[] = [];
	const db: CommitterDb = {
		readPartitionProgress: async () => null,
		insertPartitionProgress: async () => {},
		claimPartitionProgress: async () => {},
		flush: async (request) => {
			requests.push(request);
			await gate;
			if (failDeletes && (request.snapshots?.deletes.length ?? 0) > 0)
				throw new Error("relation subject_snapshots does not exist");
			return { applied: request.changes.map(() => true) };
		},
	};
	const deleteStatements = () =>
		requests.filter((request) => (request.snapshots?.deletes.length ?? 0) > 0);
	return { db, requests, deleteStatements };
};

const createStore = ({ db }: { db: CommitterDb }) =>
	createCommitterStateStore({
		ctx: {
			committer: createCommitter({
				ctx: { db },
				config: {
					concurrency: 32,
					maxRowsPerFlush: 500,
					retry,
					snapshots: { partitionCount: 64, maxBytes: 262_144 },
				},
			}),
			db,
			snapshots: { dropBatch: DROP_BATCH },
		},
	});

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
	test("evicts asked for in one tick land as one DELETE, and each caller resolves once it commits", async () => {
		const { db, requests } = createCountingDb();
		const store = createStore({ db });
		const deletes = store.evictDeletes;
		if (!deletes) throw new Error("expected evict deletes");

		await Promise.all(
			[1, 2, 3, 2].map((index) =>
				deletes.deleteCustomer({
					topic,
					partition: 4,
					customerKey: keyOf(index),
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
		const { db, deleteStatements } = createCountingDb();
		const store = createStore({ db });
		const deletes = store.evictDeletes;
		if (!deletes) throw new Error("expected evict deletes");

		await Promise.all(
			Array.from({ length: 10_000 }, (_, index) =>
				deletes.deleteCustomer({
					topic,
					partition: 4,
					customerKey: keyOf(index),
				}),
			),
		);

		const statements = deleteStatements();
		expect(statements).toHaveLength(Math.ceil(10_000 / DROP_BATCH));
		expect(
			statements.reduce(
				(total, request) => total + (request.snapshots?.deletes.length ?? 0),
				0,
			),
		).toBe(10_000);
	});

	test("a storm spread over partitions batches per partition", async () => {
		const { db, deleteStatements } = createCountingDb();
		const store = createStore({ db });
		const deletes = store.evictDeletes;
		if (!deletes) throw new Error("expected evict deletes");

		await Promise.all(
			Array.from({ length: 10_000 }, (_, index) =>
				deletes.deleteCustomer({
					topic,
					partition: index % 4,
					customerKey: keyOf(index),
				}),
			),
		);

		// 2,500 per partition: ceil(2,500 / 500) each.
		expect(deleteStatements()).toHaveLength(4 * 5);
	});

	test("a DELETE waits behind the partition's apply already in flight: Postgres order is lane order", async () => {
		const held = Promise.withResolvers<void>();
		const { db, requests } = createCountingDb({ gate: held.promise });
		const store = createStore({ db });
		await store.initializePartition({ topic, partition: 4, nextOffset: 0n });
		const deletes = store.evictDeletes;
		if (!deletes) throw new Error("expected evict deletes");
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
		const dropped = deletes.deleteCustomer({
			topic,
			partition: 4,
			customerKey: keyOf(99),
		});
		await Bun.sleep(5);

		// Only the apply's flush has reached Postgres; the drop waits for it to settle.
		expect(requests).toHaveLength(1);
		expect(requests[0]?.snapshots?.deletes ?? []).not.toContainEqual(
			customerOf(99),
		);
		held.resolve();
		await Promise.all([applied, dropped]);
		expect(requests.at(-1)?.snapshots?.deletes).toEqual([customerOf(99)]);
	});

	test("a DELETE that cannot land rejects every evict in its batch, so their evicts fail and are retried", async () => {
		const { db } = createCountingDb({ failDeletes: true });
		const store = createStore({ db });
		const deletes = store.evictDeletes;
		if (!deletes) throw new Error("expected evict deletes");

		const outcomes = await Promise.allSettled(
			[1, 2].map((index) =>
				deletes.deleteCustomer({
					topic,
					partition: 4,
					customerKey: keyOf(index),
				}),
			),
		);

		expect(outcomes.map((outcome) => outcome.status)).toEqual([
			"rejected",
			"rejected",
		]);
	});
});
