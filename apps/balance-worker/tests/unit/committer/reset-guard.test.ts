import { describe, expect, test } from "bun:test";
import {
	applyMutation,
	computeReset,
	type MutationRecord,
	parseResetCommand,
	type SubjectState,
} from "@autumn/balance-engine";
import { type SubjectRowChange, subjectRowIdOf } from "@autumn/postgres";
import { foldSubjectRowChanges } from "../../../../../packages/postgres/src/subjects/repos/applySubjectRowUpdates/foldSubjectRowChanges.js";
import { createCommitter } from "../../../src/committer/createCommitter.js";
import { createCommitterStateStore } from "../../../src/committer/createCommitterStateStore.js";
import { createMeteringRecordHandler } from "../../../src/kafka/meteringConsumer/createMeteringRecordHandler.js";
import { SubjectStaleError } from "../../../src/processor/subject/subjectErrors.js";
import type { CommitterDb } from "../../../src/types/committerDb.js";
import {
	createCustomerEntitlement,
	createState,
	createSubjectFor,
	createTrackMutation,
	stampReceipt,
	testIdentity,
	testOccurredAt,
	testOrg,
} from "../../fixtures/mutations.js";

const topic = "autumn-metering";
const partition = 3;
const rowId = "messages_monthly";
const cycleEnded = testOccurredAt - 1;
/** Where a renewal webhook moved the row's cycle, straight in Postgres. */
const renewedCycleEnd = testOccurredAt + 7 * 24 * 60 * 60 * 1000;

type Row = Record<string, unknown>;

/**
 * Postgres as the flush sees it: rows folded per flush, each update landing only where its guard holds,
 * and nothing of the flush (bookmark included) committed unless every row and the bookmark moved.
 */
function createRowStore({ nextOffset }: { nextOffset: bigint }) {
	const rows = new Map<string, Row>();
	let bookmark = nextOffset;
	const flushes: SubjectRowChange[][] = [];
	const landsOn = (draft: Map<string, Row>, change: SubjectRowChange) => {
		if (change.op === "promote") return true;
		const key = `${change.table}:${subjectRowIdOf(change)}`;
		const row = draft.get(key);
		if (change.op === "insert") {
			if (row) return false;
			draft.set(key, { ...change.row });
			return true;
		}
		if (!row) return false;
		if (change.op === "delete") return draft.delete(key);
		const guardHolds = Object.entries(change.guard).every(
			([column, value]) => row[column] === value,
		);
		if (!guardHolds) return false;
		const next: Row = { ...row, ...change.set };
		for (const [column, delta] of Object.entries(change.add))
			next[column] = Number(next[column] ?? 0) + delta;
		draft.set(key, next);
		return true;
	};
	const db: CommitterDb = {
		readPartitionProgress: async () => ({
			nextOffset: bookmark,
			commandNextOffset: null,
			ownerFence: null,
			claimToken: null,
		}),
		insertPartitionProgress: async () => {},
		claimPartitionProgress: async () => {},
		flush: async (request) => {
			flushes.push([...request.changes]);
			const { folded, foldedIndexOf } = foldSubjectRowChanges({
				changes: request.changes,
			});
			const draft = new Map(
				[...rows].map(([key, row]) => [key, { ...row }] as const),
			);
			const landed = folded.map((change) => landsOn(draft, change));
			const applied = foldedIndexOf.map(
				(index) => index === null || landed[index] === true,
			);
			const movesBookmark = request.bookmarks.every(
				(moved) => moved.expectedOffset === bookmark,
			);
			if (movesBookmark && !applied.includes(false)) {
				rows.clear();
				for (const [key, row] of draft) rows.set(key, row);
				const last = request.bookmarks.at(-1);
				if (last) bookmark = last.nextOffset;
			}
			return { applied };
		},
	};
	return {
		db,
		flushes,
		bookmark: () => bookmark,
		row: () => rows.get(`customerEntitlements:${rowId}`),
		/** A billing path writing the customer entitlement directly, outside the worker. */
		writeOutsideWorker: (fields: Row) => {
			const key = `customerEntitlements:${rowId}`;
			rows.set(key, { ...rows.get(key), ...fields });
		},
		seed: (state: SubjectState) => {
			for (const row of state.customerEntitlements)
				rows.set(`customerEntitlements:${row.id}`, { ...row });
		},
	};
}

/** The worker's view at t0: the row's cycle ended, so the next command refills it first. */
const dueState = (): SubjectState =>
	createState({
		customerEntitlements: [
			{
				...createCustomerEntitlement({ balance: 10 }),
				next_reset_at: cycleEnded,
			},
		],
	});

/** The reset the engine decides for that row, exactly as it reaches the log. */
const decideReset = ({ state }: { state: SubjectState }) => {
	const command = parseResetCommand({
		input: {
			schemaVersion: 1,
			type: "reset",
			commandId: "cmd_track_2:reset",
			requestId: "req_cmd_track_2",
			identity: testIdentity,
			occurredAt: testOccurredAt,
			org: testOrg,
		},
	});
	const mutation = computeReset({
		fullSubject: createSubjectFor({ state }),
		command,
	});
	if (!mutation) throw new Error("expected the row to be due");
	return {
		record: stampReceipt({
			mutation,
			command,
			deduplicationExpiresAt: testOccurredAt,
		}),
		refilled: applyMutation({ state, mutation }),
	};
};

/** The worker's sequence: a track, then the next command's reset and its own track, each decided on the last. */
const decideSequence = () => {
	const initial = dueState();
	const before = createTrackMutation({
		state: initial,
		value: 5,
		commandId: "cmd_track_1",
	});
	const reset = decideReset({
		state: applyMutation({ state: initial, mutation: before }),
	});
	const after = createTrackMutation({
		state: reset.refilled,
		value: 5,
		commandId: "cmd_track_2",
	});
	return {
		initial,
		before,
		reset: reset.record,
		after,
		refilledTo: reset.refilled.customerEntitlements[0],
	};
};

const at = (offset: bigint, mutation: MutationRecord) => ({
	position: { topic, partition, offset },
	mutation,
});

async function createStore(rows: ReturnType<typeof createRowStore>) {
	const store = createCommitterStateStore({
		ctx: { committer: createCommitter({ ctx: { db: rows.db } }), db: rows.db },
	});
	await store.loadProgress({ topic, partition });
	return store;
}

describe("a reset never overwrites a billing write", () => {
	test("a reset's refill lands under the cycle it ended and the balances it replaces: the engine's `before` is its guard", async () => {
		const rows = createRowStore({ nextOffset: 0n });
		const { initial, reset } = decideSequence();
		rows.seed(initial);
		const store = await createStore(rows);

		await store.applyDurableMutations({ records: [at(0n, reset)] });

		const refill = rows.flushes[0]?.find(
			(change) => change.table === "customerEntitlements",
		);
		expect(refill?.op === "update" && refill.guard).toEqual({
			next_reset_at: cycleEnded,
			balance: 5,
			additional_balance: 0,
			adjustment: 0,
		});
	});

	test("billing renews the row while the reset lingers: the reset is skipped, both tracks land on the billing row, the partition moves on", async () => {
		const rows = createRowStore({ nextOffset: 0n });
		const { initial, before, reset, after } = decideSequence();
		rows.seed(initial);
		const store = await createStore(rows);

		// t1: the renewal lands in Postgres while the worker's batch is committed but unapplied.
		rows.writeOutsideWorker({ balance: 500, next_reset_at: renewedCycleEnd });
		// t2: the batch applies, the reset folded between the two tracks on the same row.
		const results = await store.applyDurableMutations({
			records: [at(0n, before), at(1n, reset), at(2n, after)],
		});

		expect(results.map((result) => result.kind)).toEqual([
			"applied",
			"rejected",
			"applied",
		]);
		const rejected = results[1];
		expect(rejected?.kind === "rejected" && rejected.cause).toBeInstanceOf(
			SubjectStaleError,
		);
		expect(rows.row()).toMatchObject({
			balance: 490,
			next_reset_at: renewedCycleEnd,
		});
		expect(rows.bookmark()).toBe(3n);
		expect(store.readNextOffset({ topic, partition })).toBe(3n);
	});

	test("nothing wrote the row: the reset lands with the tracks around it in one flush", async () => {
		const rows = createRowStore({ nextOffset: 0n });
		const { initial, before, reset, after, refilledTo } = decideSequence();
		rows.seed(initial);
		const store = await createStore(rows);

		const results = await store.applyDurableMutations({
			records: [at(0n, before), at(1n, reset), at(2n, after)],
		});

		expect(results.map((result) => result.kind)).toEqual([
			"applied",
			"applied",
			"applied",
		]);
		expect(rows.flushes).toHaveLength(1);
		expect(rows.row()).toMatchObject({
			balance: (refilledTo?.balance ?? 0) - 5,
			next_reset_at: refilledTo?.next_reset_at,
		});
		expect(rows.bookmark()).toBe(3n);
	});

	test("the same update from any other command stays last-write-wins: a billing plan, a balance edit or a recalculation is never refused", async () => {
		for (const type of [
			"applyBillingPlan",
			"updateBalance",
			"recalculateBalance",
			"track",
		] as const) {
			const rows = createRowStore({ nextOffset: 0n });
			const { initial, reset } = decideSequence();
			rows.seed(initial);
			const store = await createStore(rows);
			rows.writeOutsideWorker({ balance: 500, next_reset_at: renewedCycleEnd });

			const write = {
				...reset,
				id: `cmd_${type}`,
				command: { ...reset.command, type },
			} as MutationRecord;
			const [result] = await store.applyDurableMutations({
				records: [at(0n, write)],
			});

			expect({ type, kind: result?.kind }).toEqual({ type, kind: "applied" });
			const refill = rows.flushes[0]?.find(
				(change) => change.table === "customerEntitlements",
			);
			expect(refill?.op === "update" && refill.guard).toEqual({});
		}
	});

	test("a billing plan folded behind a superseded reset still lands: only the reset is skipped", async () => {
		const rows = createRowStore({ nextOffset: 0n });
		const { initial, reset } = decideSequence();
		rows.seed(initial);
		const store = await createStore(rows);
		rows.writeOutsideWorker({ balance: 500, next_reset_at: renewedCycleEnd });

		const plan = {
			...reset,
			id: "cmd_plan",
			command: { ...reset.command, type: "applyBillingPlan" },
			changes: [
				{
					table: "customerEntitlements",
					op: "update",
					id: rowId,
					before: { balance: 1000 },
					after: { balance: 2000 },
				},
			],
		} as MutationRecord;
		const results = await store.applyDurableMutations({
			records: [at(0n, reset), at(1n, plan)],
		});

		expect(results.map((result) => result.kind)).toEqual([
			"rejected",
			"applied",
		]);
		expect(rows.row()).toMatchObject({
			balance: 2000,
			next_reset_at: renewedCycleEnd,
		});
		expect(rows.bookmark()).toBe(2n);
	});

	test("a billing write that changes the balance but keeps the cycle supersedes the reset too: it is skipped, then decided again on the new rows", async () => {
		const rows = createRowStore({ nextOffset: 0n });
		const { initial, before, reset } = decideSequence();
		rows.seed(initial);
		const store = await createStore(rows);
		// The track before the reset has landed, so Postgres holds what the reset was decided on.
		await store.applyDurableMutations({ records: [at(0n, before)] });

		// t1: a quantity change adds 100 to the row in Postgres; its cycle stays where it was.
		const paidFor = Number(rows.row()?.balance) + 100;
		rows.writeOutsideWorker({ balance: paidFor });
		// t2: the reset decided before it lands.
		const [result] = await store.applyDurableMutations({
			records: [at(1n, reset)],
		});

		expect(result?.kind).toBe("rejected");
		expect(rows.row()).toMatchObject({
			balance: paidFor,
			next_reset_at: cycleEnded,
		});
		expect(rows.bookmark()).toBe(2n);

		// t3: the evicted customer reloads from Postgres; the row is still due, so the reset is decided on what it holds now.
		const reloaded = createState({
			customerEntitlements: [
				{
					...initial.customerEntitlements[0],
					...rows.row(),
				} as SubjectState["customerEntitlements"][number],
			],
		});
		const redecided = decideReset({ state: reloaded });
		const [again] = await store.applyDurableMutations({
			records: [at(2n, redecided.record)],
		});

		expect(again?.kind).toBe("applied");
		expect(rows.row()).toMatchObject({
			next_reset_at: redecided.refilled.customerEntitlements[0]?.next_reset_at,
		});
	});

	test("a balance-only billing write supersedes a reset folded behind a track in the same flush: the guard is carried back across the track", async () => {
		const rows = createRowStore({ nextOffset: 0n });
		const { initial, before, reset, after } = decideSequence();
		rows.seed(initial);
		const store = await createStore(rows);

		// t1: billing rewrites the balance in place while the track, the reset and its track are unapplied.
		rows.writeOutsideWorker({ balance: 500 });
		const results = await store.applyDurableMutations({
			records: [at(0n, before), at(1n, reset), at(2n, after)],
		});

		expect(results.map((result) => result.kind)).toEqual([
			"applied",
			"rejected",
			"applied",
		]);
		expect(rows.row()).toMatchObject({
			balance: 490,
			next_reset_at: cycleEnded,
		});
		expect(rows.bookmark()).toBe(3n);
	});

	test("a successor replaying an unapplied reset after the renewal skips it the same way, and replays on", async () => {
		const rows = createRowStore({ nextOffset: 1n });
		const { initial, before, reset, after } = decideSequence();
		rows.seed(applyMutation({ state: initial, mutation: before }));
		// t0: the reset and its track are on the log, the owner crashes before applying them.
		// t1: the renewal lands in Postgres.
		rows.writeOutsideWorker({ balance: 500, next_reset_at: renewedCycleEnd });
		// t2: the successor replays from the bookmark through the metering record handler.
		const store = await createStore(rows);
		const handler = createMeteringRecordHandler({
			ctx: {
				stateStore: store,
				partitionOffsets: {
					fetchTopicOffsets: async () => {
						throw new Error("No broker read expected");
					},
				},
				recentCommandsByPartition: new Map(),
				replayFloorByPartition: new Map(),
				replayByPartition: new Map(),
			},
		});

		await handler.applyRecord({
			position: { topic, partition, offset: 1n },
			record: reset,
			ownerEpoch: undefined,
		});
		expect(rows.row()).toMatchObject({
			balance: 500,
			next_reset_at: renewedCycleEnd,
		});
		expect(rows.bookmark()).toBe(2n);

		await handler.applyRecord({
			position: { topic, partition, offset: 2n },
			record: after,
			ownerEpoch: undefined,
		});
		expect(rows.row()).toMatchObject({
			balance: 495,
			next_reset_at: renewedCycleEnd,
		});
		expect(rows.bookmark()).toBe(3n);
	});
});
