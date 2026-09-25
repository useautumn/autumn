import { describe, expect, test } from "bun:test";
import {
	FlushBookmarkConflictError,
	type SubjectRowChange,
	subjectRowIdOf,
} from "@autumn/postgres";
import { FlushRecordRefusedError } from "../../../src/committer/committerErrors.js";
import { createCommitter } from "../../../src/committer/createCommitter.js";
import { createCommitterStateStore } from "../../../src/committer/createCommitterStateStore.js";
import { SubjectStaleError } from "../../../src/processor/subject/subjectErrors.js";
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

/** A Postgres stand-in that remembers its bookmark and every update, and can refuse a guard or a bookmark. */
function createFakeCommitterDb({
	storedNextOffset = null,
	staleIds = new Set<string>(),
	conflictIds = new Set<string>(),
}: {
	storedNextOffset?: bigint | null;
	staleIds?: Set<string>;
	/** Rows whose flush finds the bookmark moved by another worker. */
	conflictIds?: Set<string>;
} = {}) {
	const progress = new Map<string, bigint>();
	const commandProgress = new Map<string, bigint>();
	const fences = new Map<string, { epoch: bigint; offset: bigint }>();
	if (storedNextOffset !== null)
		progress.set(`${topic}[${partition}]`, storedNextOffset);
	const updates: SubjectRowChange[] = [];
	const transactions: ("committed" | "rolled_back")[] = [];
	const db: CommitterDb = {
		readPartitionProgress: async (position) => {
			const key = `${position.topic}[${position.partition}]`;
			const nextOffset = progress.get(key);
			if (nextOffset === undefined) return null;
			return {
				nextOffset,
				commandNextOffset: commandProgress.get(key) ?? null,
				ownerFence: fences.get(key) ?? null,
			};
		},
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
			const conflicted = request.changes.some((change) =>
				conflictIds.has(subjectRowIdOf(change)),
			);
			if (conflicted || moved.length !== request.bookmarks.length) {
				transactions.push("rolled_back");
				throw new FlushBookmarkConflictError({
					expected: request.bookmarks.length,
					advanced: conflicted ? 0 : moved.length,
				});
			}
			if (applied.includes(false)) {
				transactions.push("rolled_back");
				return { applied };
			}
			updates.push(...request.changes);
			for (const bookmark of moved) {
				const key = `${bookmark.topic}[${bookmark.partition}]`;
				progress.set(key, bookmark.nextOffset);
				if (bookmark.commandNextOffset !== undefined)
					commandProgress.set(key, bookmark.commandNextOffset);
				const fence = bookmark.ownerFence;
				if (fence && (fences.get(key)?.epoch ?? -1n) < fence.epoch)
					fences.set(key, fence);
			}
			transactions.push("committed");
			return { applied };
		},
	};
	return { db, progress, commandProgress, fences, updates, transactions };
}

function createStore(fake: ReturnType<typeof createFakeCommitterDb>) {
	return createCommitterStateStore({
		ctx: { committer: createCommitter({ ctx: { db: fake.db } }), db: fake.db },
	});
}

describe("committer state store", () => {
	test("an owner fence lands beside the bookmark, reloads with it, and a lower epoch never replaces it", async () => {
		const fake = createFakeCommitterDb({ storedNextOffset: 43n });
		const store = createStore(fake);
		await store.loadProgress({ topic, partition });
		expect(store.readOwnerFence?.({ topic, partition })).toBeNull();

		await store.advanceOwnerFence?.({
			topic,
			partition,
			fence: { epoch: 512n, offset: 40n },
		});
		expect(fake.transactions).toEqual(["committed"]);
		expect(fake.fences.get(`${topic}[${partition}]`)).toEqual({
			epoch: 512n,
			offset: 40n,
		});
		// The marker moves no bookmark: the record after it does.
		expect(fake.progress.get(`${topic}[${partition}]`)).toBe(43n);
		expect(store.readOwnerFence?.({ topic, partition })).toEqual({
			epoch: 512n,
			offset: 40n,
		});

		await store.advanceOwnerFence?.({
			topic,
			partition,
			fence: { epoch: 500n, offset: 41n },
		});
		expect(fake.transactions).toEqual(["committed"]);
		expect(store.readOwnerFence?.({ topic, partition })).toEqual({
			epoch: 512n,
			offset: 40n,
		});

		const reloaded = createStore(fake);
		await reloaded.loadProgress({ topic, partition });
		expect(reloaded.readOwnerFence?.({ topic, partition })).toEqual({
			epoch: 512n,
			offset: 40n,
		});
	});

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

	test("a consumed command moves the command bookmark with the rows; one sent over HTTP leaves it alone", async () => {
		const fake = createFakeCommitterDb({ storedNextOffset: 0n });
		const store = createStore(fake);
		await store.loadProgress({ topic, partition });
		expect(store.readCommandNextOffset({ topic, partition })).toBeNull();

		const state = createState({ balance: 100 });
		const queued = {
			...createTrackMutation({ state, value: 5, commandId: "cmd_1" }),
			source: { commandOffset: "41" },
		};
		await store.applyDurableMutations({
			records: [
				{ position: { topic, partition, offset: 0n }, mutation: queued },
			],
		});
		expect(fake.commandProgress.get(`${topic}[${partition}]`)).toBe(42n);
		expect(store.readCommandNextOffset({ topic, partition })).toBe(42n);

		const sent = createTrackMutation({
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
		await store.applyDurableMutations({
			records: [{ position: { topic, partition, offset: 1n }, mutation: sent }],
		});
		expect(store.readNextOffset({ topic, partition })).toBe(2n);
		expect(store.readCommandNextOffset({ topic, partition })).toBe(42n);
	});

	test("a bookmark-only completion preserves rows and survives reloading progress", async () => {
		const fake = createFakeCommitterDb({ storedNextOffset: 43n });
		const store = createStore(fake);
		await store.loadProgress({ topic, partition });
		await store.advanceCommandNextOffset({
			topic,
			partition,
			commandNextOffset: 42n,
		});
		expect(store.readNextOffset({ topic, partition })).toBe(43n);
		expect(fake.updates).toEqual([]);
		const restarted = createStore(fake);
		await restarted.loadProgress({ topic, partition });
		expect(restarted.readCommandNextOffset({ topic, partition })).toBe(42n);
		await restarted.advanceCommandNextOffset({
			topic,
			partition,
			commandNextOffset: 40n,
		});
		expect(restarted.readCommandNextOffset({ topic, partition })).toBe(42n);
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

	test("a stale row rolls its batch back, then is skipped: the bookmark moves past it and its caller is told", async () => {
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

		mutation.source = { commandOffset: "41" };
		const results = await store.applyDurableMutations({
			records: [{ position: { topic, partition, offset: 43n }, mutation }],
		});
		expect(store.readCommandNextOffset({ topic, partition })).toBe(42n);
		expect(results).toHaveLength(1);
		const [result] = results;
		expect(result?.kind).toBe("rejected");
		expect(result?.kind === "rejected" && result.cause).toBeInstanceOf(
			SubjectStaleError,
		);
		expect(result?.kind === "rejected" && result.cause.message).toBe(
			"Customer cus_1 changed underneath the decision in org_1/sandbox",
		);
		// The decision rolls back; the skip lands only the bookmark, so a replay never meets this record again.
		expect(fake.transactions).toEqual(["rolled_back", "committed"]);
		expect(fake.updates).toEqual([]);
		expect(fake.progress.get(`${topic}[${partition}]`)).toBe(44n);
		expect(store.readNextOffset({ topic, partition })).toBe(44n);
	});

	test("initialize creates the bookmark once; a baseline record is refused and skipped until it is a map fill", async () => {
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
		expect(refused?.kind).toBe("rejected");
		expect(refused?.kind === "rejected" && refused.cause).toBeInstanceOf(
			FlushRecordRefusedError,
		);
		expect(refused?.kind === "rejected" && refused.cause.message).toBe(
			"Log record refused by Postgres and skipped: init_1 (Row change not supported by the postgres backend: insert customer)",
		);
		expect(store.readNextOffset({ topic, partition })).toBe(101n);
	});

	test("a record whose bookmark was moved by another worker: earlier ones apply, it fails, later ones are blocked, the bookmark stops at it", async () => {
		const fake = createFakeCommitterDb({
			storedNextOffset: 10n,
			conflictIds: new Set(["poison"]),
		});
		const store = createStore(fake);
		await store.loadProgress({ topic, partition });
		const state = createState({ balance: 100 });
		const good = createTrackMutation({ state, value: 5, commandId: "cmd_a" });
		good.source = { commandOffset: "41" };
		const poison = createTrackMutation({ state, value: 5, commandId: "cmd_b" });
		poison.source = { commandOffset: "42" };
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
		expect(store.readCommandNextOffset({ topic, partition })).toBe(42n);
		expect(store.readNextOffset({ topic, partition })).toBe(11n);
		expect(fake.progress.get(`${topic}[${partition}]`)).toBe(11n);
	});
});
