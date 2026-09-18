import { describe, expect, test } from "bun:test";
import { type SubjectRowChange, subjectRowIdOf } from "@autumn/postgres";
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
	const updates: SubjectRowChange[] = [];
	const transactions: ("committed" | "rolled_back")[] = [];
	const db: CommitterDb = {
		readNextOffset: async (position) =>
			progress.get(`${position.topic}[${position.partition}]`) ?? null,
		insertPartitionProgress: async ({ topic, partition, nextOffset }) => {
			progress.set(`${topic}[${partition}]`, nextOffset);
		},
		// Rolls back like Postgres would: nothing lands unless every bookmark moved.
		flush: async (request) => {
			const applied = request.changes.map(
				(change) => !staleIds.has(subjectRowIdOf(change)),
			);
			const moved = request.bookmarks.filter(
				(bookmark) =>
					progress.get(`${bookmark.topic}[${bookmark.partition}]`) ===
					bookmark.expectedOffset,
			);
			if (moved.length !== request.bookmarks.length) {
				transactions.push("rolled_back");
				throw new Error("bookmark conflict");
			}
			if (applied.includes(false)) {
				transactions.push("rolled_back");
				return { applied };
			}
			updates.push(...request.changes);
			for (const bookmark of moved) {
				progress.set(
					`${bookmark.topic}[${bookmark.partition}]`,
					bookmark.nextOffset,
				);
			}
			transactions.push("committed");
			return { applied };
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
				op: "update",
				table: "customerEntitlements",
				id: "messages_monthly",
				set: {},
				add: { balance: -5 },
				addEntries: {},
				guard: {},
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
		expect(
			fake.updates.map((change) =>
				change.op === "update" ? change.add : null,
			),
		).toEqual([{ balance: -5 }, { balance: -5 }]);
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

		const results = await store.applyDurableMutations({
			records: [{ position: { topic, partition, offset: 43n }, mutation }],
		});
		expect(results).toHaveLength(1);
		const [result] = results;
		expect(result?.kind === "failed" && (result.cause as Error).message).toBe(
			"Log record could not be committed to Postgres: cmd_1",
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

		const [refused] = await store.applyDurableMutations({
			records: [
				{
					position: { topic, partition, offset: 100n },
					mutation: createInitializeMutation(),
				},
			],
		});
		expect(refused?.kind === "failed" && (refused.cause as Error).message).toBe(
			"Log record could not be committed to Postgres: init_1",
		);
		expect(store.readNextOffset({ topic, partition })).toBe(100n);
	});

	test("a record that will not land: earlier ones apply, it fails, later ones are blocked, the bookmark stops at it", async () => {
		const fake = createFakeCommitterDb({
			storedNextOffset: 10n,
			staleIds: new Set(["poison"]),
		});
		const store = createStore(fake);
		await store.loadProgress({ topic, partition });
		const state = createState({ balance: 100 });
		const good = createTrackMutation({ state, value: 5, commandId: "cmd_a" });
		const poison = createTrackMutation({ state, value: 5, commandId: "cmd_b" });
		poison.changes = poison.changes.map((change) => ({
			...change,
			id: "poison",
		}));
		const after = createTrackMutation({ state, value: 5, commandId: "cmd_c" });

		const results = await store.applyDurableMutations({
			records: [
				{ position: { topic, partition, offset: 10n }, mutation: good },
				{ position: { topic, partition, offset: 11n }, mutation: poison },
				{ position: { topic, partition, offset: 12n }, mutation: after },
			],
		});

		expect(results.map((result) => result.kind)).toEqual([
			"applied",
			"failed",
			"failed",
		]);
		const [, failed, blocked] = results;
		expect(failed?.kind === "failed" && (failed.cause as Error).name).toBe(
			"FlushRecordFailedError",
		);
		expect(blocked?.kind === "failed" && (blocked.cause as Error).message).toBe(
			"Log record cmd_c waits behind cmd_b",
		);
		expect(store.readNextOffset({ topic, partition })).toBe(11n);
		expect(fake.progress.get(`${topic}[${partition}]`)).toBe(11n);
	});
});
