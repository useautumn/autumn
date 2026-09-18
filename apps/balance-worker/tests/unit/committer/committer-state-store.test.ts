import { describe, expect, test } from "bun:test";
import type { SubjectRowUpdate } from "@autumn/postgres";
import { createCommitter } from "../../../src/committer/createCommitter.js";
import { createCommitterStateStore } from "../../../src/committer/createCommitterStateStore.js";
import type { CommitterDb } from "../../../src/types/committerDb.js";
import {
	createCustomerEntitlement,
	createInitializeMutation,
	createState,
	createTrackMutation,
	testIdentity,
} from "../../fixtures/mutations.js";

const topic = "autumn-metering";
const partition = 7;

/** A Postgres stand-in that remembers its bookmark and every update, and can refuse a guard. */
function createFakeCommitterDb({
	storedNextOffset = null,
	staleIds = new Set<string>(),
}: {
	storedNextOffset?: bigint | null;
	staleIds?: Set<string>;
} = {}) {
	const progress = new Map<string, bigint>();
	if (storedNextOffset !== null)
		progress.set(`${topic}[${partition}]`, storedNextOffset);
	const updates: SubjectRowUpdate[] = [];
	const transactions: ("committed" | "rolled_back")[] = [];
	const db: CommitterDb = {
		readNextOffset: async (position) =>
			progress.get(`${position.topic}[${position.partition}]`) ?? null,
		insertPartitionProgress: async ({ topic, partition, nextOffset }) => {
			progress.set(`${topic}[${partition}]`, nextOffset);
		},
		transaction: async (run) => {
			const snapshot = new Map(progress);
			const seen = updates.length;
			try {
				const result = await run({
					applySubjectRowUpdates: async ({ updates: batch }) => {
						updates.push(...batch);
						return { applied: batch.map((update) => !staleIds.has(update.id)) };
					},
					advancePartitionProgress: async ({
						topic,
						partition,
						expectedOffset,
						nextOffset,
					}) => {
						const key = `${topic}[${partition}]`;
						if (progress.get(key) !== expectedOffset)
							return { advanced: false };
						progress.set(key, nextOffset);
						return { advanced: true };
					},
				});
				transactions.push("committed");
				return result;
			} catch (cause) {
				progress.clear();
				for (const [key, value] of snapshot) progress.set(key, value);
				updates.length = seen;
				transactions.push("rolled_back");
				throw cause;
			}
		},
	};
	return { db, progress, updates, transactions };
}

function createStore(fake: ReturnType<typeof createFakeCommitterDb>) {
	return createCommitterStateStore({
		ctx: { committer: createCommitter({ ctx: { db: fake.db } }), db: fake.db },
	});
}

describe("committer state store", () => {
	test("a track lands as one guarded update and one bookmark advance, in one transaction", async () => {
		const fake = createFakeCommitterDb({ storedNextOffset: 43n });
		const store = createStore(fake);
		await store.loadProgress({ topic, partition });
		expect(store.readNextOffset({ topic, partition })).toBe(43n);

		const state = createState({ balance: 100 });
		const mutation = createTrackMutation({ state, value: 5 });
		const results = await store.applyDurableMutations({
			records: [{ position: { topic, partition, offset: 43n }, mutation }],
		});

		expect(results).toEqual([{ kind: "applied", mutation, nextOffset: 44n }]);
		expect(fake.updates).toEqual([
			{
				table: "customerEntitlements",
				id: "messages_monthly",
				before: { balance: 100 },
				after: { balance: 95 },
			},
		]);
		expect(fake.transactions).toEqual(["committed"]);
		expect(fake.progress.get(`${topic}[${partition}]`)).toBe(44n);
		expect(store.readNextOffset({ topic, partition })).toBe(44n);
		expect(store.readState({ identity: testIdentity })).toBeNull();
	});

	test("records below the bookmark are already applied; the rest must be contiguous", async () => {
		const fake = createFakeCommitterDb({ storedNextOffset: 43n });
		const store = createStore(fake);
		await store.loadProgress({ topic, partition });
		const state = createState({ balance: 100 });
		const first = createTrackMutation({ state, value: 5, commandId: "cmd_1" });
		const second = createTrackMutation({
			state: {
				...state,
				revision: 1,
				customerEntitlements: [
					{ ...createCustomerEntitlement({ balance: 95 }) },
				],
			},
			value: 5,
			commandId: "cmd_2",
		});

		const results = await store.applyDurableMutations({
			records: [
				{ position: { topic, partition, offset: 42n }, mutation: first },
				{ position: { topic, partition, offset: 43n }, mutation: first },
				{ position: { topic, partition, offset: 44n }, mutation: second },
			],
		});
		expect(results.map((result) => result.kind)).toEqual([
			"position_already_applied",
			"applied",
			"applied",
		]);
		expect(fake.updates.map((update) => update.before)).toEqual([
			{ balance: 100 },
			{ balance: 95 },
		]);
		expect(store.readNextOffset({ topic, partition })).toBe(45n);

		// A gap is a commit marker, not a lost record; going backwards inside a batch is corruption.
		await expect(
			store.applyDurableMutations({
				records: [
					{ position: { topic, partition, offset: 47n }, mutation: second },
					{ position: { topic, partition, offset: 46n }, mutation: second },
				],
			}),
		).rejects.toThrow("offset 48, received 46");
	});

	test("a stale row rolls the whole batch back and leaves the bookmark where it was", async () => {
		const fake = createFakeCommitterDb({
			storedNextOffset: 43n,
			staleIds: new Set(["messages_monthly"]),
		});
		const store = createStore(fake);
		await store.loadProgress({ topic, partition });
		const mutation = createTrackMutation({
			state: createState({ balance: 100 }),
			value: 5,
		});

		await expect(
			store.applyDurableMutations({
				records: [{ position: { topic, partition, offset: 43n }, mutation }],
			}),
		).rejects.toThrow(
			"Subject rows moved underneath the worker: messages_monthly",
		);
		expect(fake.transactions).toEqual(["rolled_back"]);
		expect(fake.progress.get(`${topic}[${partition}]`)).toBe(43n);
		expect(store.readNextOffset({ topic, partition })).toBe(43n);
	});

	test("initialize creates the bookmark once; a baseline record is refused until it is a map fill", async () => {
		const fake = createFakeCommitterDb();
		const store = createStore(fake);
		await store.loadProgress({ topic, partition });
		expect(store.readNextOffset({ topic, partition })).toBeNull();

		await store.initializePartition({ topic, partition, nextOffset: 100n });
		await store.initializePartition({ topic, partition, nextOffset: 100n });
		expect(fake.progress.get(`${topic}[${partition}]`)).toBe(100n);
		await expect(
			store.initializePartition({ topic, partition, nextOffset: 101n }),
		).rejects.toThrow("is already initialized");

		await expect(
			store.applyDurableMutations({
				records: [
					{
						position: { topic, partition, offset: 100n },
						mutation: createInitializeMutation(),
					},
				],
			}),
		).rejects.toThrow(
			"Row change not supported by the postgres backend: insert customer",
		);
	});
});
