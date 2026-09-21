import { describe, expect, test } from "bun:test";
import { CusProductStatus, ResetInterval } from "@autumn/shared";
import {
	applyMutation,
	computeFinalize,
	computeTrack,
	type FinalizeCommand,
	LockNotFoundError,
	type SubjectState,
	type WorkerLock,
} from "../../../../src/balanceEngine.js";
import { splitFinalize } from "../../../../src/commands/finalize/splitFinalize.js";
import { customerWith } from "../../deduction/deductionFixtures.js";
import {
	createCustomerEntitlement,
	createState,
	createSubjectFor,
	createTrackCommand,
	identity,
	occurredAt,
	org,
} from "../../engineFixtures.js";

const balanceOf = ({
	state,
	id = "messages_monthly",
}: {
	state: SubjectState;
	id?: string;
}) => state.customerEntitlements.find((row) => row.id === id)?.balance;

/** Takes a lock the way the worker does, returning the state after it and the row finalize is handed. */
const takeLock = ({
	state,
	value,
	overageBehavior = "reject",
}: {
	state: SubjectState;
	value: number;
	overageBehavior?: "cap" | "reject" | "overflow";
}): { state: SubjectState; lock: WorkerLock } => {
	const mutation = computeTrack({
		fullSubject: createSubjectFor({ state }),
		command: {
			...createTrackCommand({ value, overageBehavior, commandId: "cmd_lock" }),
			lock: {
				id: "lck_1",
				lockId: "L1",
				expiresAt: occurredAt + 86_400_000,
				expiryAction: "confirm",
			},
		},
	});
	const lockChange = mutation.changes.find(
		(change) => change.table === "locks" && change.op === "insert",
	);
	if (lockChange?.table !== "locks" || lockChange.op !== "insert")
		throw new Error("Expected the track to open a lock");
	return { state: applyMutation({ state, mutation }), lock: lockChange.row };
};

const finalizeCommand = ({
	lock,
	finalValue,
	blocksOverdue = false,
}: {
	lock: WorkerLock;
	finalValue: number;
	blocksOverdue?: boolean;
}): FinalizeCommand => ({
	schemaVersion: 1,
	type: "finalize",
	commandId: `cmd_finalize_${finalValue}`,
	requestId: "req_finalize",
	identity,
	occurredAt,
	org: {
		config: { ...org.config, block_overdue_entitlements: blocksOverdue },
	},
	lock,
	internalFeatureId: "feat_messages",
	finalValue,
	properties: null,
});

const finalize = ({
	state,
	lock,
	finalValue,
	blocksOverdue,
}: {
	state: SubjectState;
	lock: WorkerLock;
	finalValue: number;
	blocksOverdue?: boolean;
}) => {
	const mutation = computeFinalize({
		fullSubject: createSubjectFor({ state }),
		command: finalizeCommand({ lock, finalValue, blocksOverdue }),
	});
	return { mutation, state: applyMutation({ state, mutation }) };
};

describe("splitFinalize", () => {
	test.concurrent("covers every way a lock reaches its final value", () => {
		const split = (lockValue: number, finalValue: number) =>
			splitFinalize({ lockValue, finalValue });
		expect(split(8, 8)).toEqual({ unwindValue: 0, additionalValue: 0 });
		expect(split(8, 5)).toEqual({ unwindValue: 3, additionalValue: 0 });
		expect(split(8, 11)).toEqual({ unwindValue: 0, additionalValue: 3 });
		expect(split(8, 0)).toEqual({ unwindValue: 8, additionalValue: 0 });
		expect(split(8, -3)).toEqual({ unwindValue: 8, additionalValue: -3 });
		expect(split(-5, -3)).toEqual({ unwindValue: 2, additionalValue: 0 });
		expect(split(-5, 3)).toEqual({ unwindValue: 5, additionalValue: 3 });
		expect(split(0, 1.2)).toEqual({ unwindValue: 0, additionalValue: 1.2 });
	});
});

describe("computeFinalize", () => {
	test.concurrent("a confirm below the lock gives the difference back", () => {
		const locked = takeLock({ state: createState(), value: 8 });
		expect(balanceOf({ state: locked.state })).toBe(2);
		const { state, mutation } = finalize({ ...locked, finalValue: 5 });
		expect(balanceOf({ state })).toBe(5);
		expect(state.openLocks).toEqual([]);
		expect(mutation.result).toMatchObject({
			status: "applied",
			lockValue: 8,
			finalValue: 5,
		});
	});

	test.concurrent("a release gives everything back", () => {
		const locked = takeLock({ state: createState(), value: 8 });
		const { state } = finalize({ ...locked, finalValue: 0 });
		expect(balanceOf({ state })).toBe(10);
		expect(state.openLocks).toEqual([]);
	});

	test.concurrent("a confirm above the lock takes the difference", () => {
		const locked = takeLock({ state: createState(), value: 8 });
		const { state } = finalize({ ...locked, finalValue: 9 });
		expect(balanceOf({ state })).toBe(1);
	});

	test.concurrent(
		"a confirm at the lock moves no balance, only closes it",
		() => {
			const locked = takeLock({ state: createState(), value: 8 });
			const { state, mutation } = finalize({ ...locked, finalValue: 8 });
			expect(balanceOf({ state })).toBe(2);
			expect(mutation.changes).toEqual([
				{ table: "locks", op: "delete", id: "lck_1" },
			]);
		},
	);

	test.concurrent(
		"a confirm the balance cannot fund is rejected and the lock stays open",
		() => {
			const locked = takeLock({ state: createState(), value: 8 });
			const { state, mutation } = finalize({ ...locked, finalValue: 11 });
			expect(mutation.result).toMatchObject({
				status: "rejected",
				reason: "insufficient_balance",
			});
			expect(mutation.changes).toEqual([]);
			expect(balanceOf({ state })).toBe(2);
			expect(state.openLocks).toEqual([{ id: "lck_1", lock_id: "L1" }]);
		},
	);

	test.concurrent(
		"the lock's overage behaviour governs a confirm above it",
		() => {
			const locked = takeLock({
				state: createState(),
				value: 8,
				overageBehavior: "cap",
			});
			const { state, mutation } = finalize({ ...locked, finalValue: 50 });
			expect(mutation.result).toMatchObject({ status: "applied" });
			expect(balanceOf({ state })).toBe(0);
		},
	);

	test.concurrent("a second finalize finds no lock", () => {
		const locked = takeLock({ state: createState(), value: 8 });
		const { state } = finalize({ ...locked, finalValue: 5 });
		expect(() => finalize({ state, lock: locked.lock, finalValue: 5 })).toThrow(
			new LockNotFoundError({ lockId: "L1" }),
		);
	});

	test.concurrent("the unwind returns to the newest bucket first", () => {
		const twoBuckets = createState({
			customerEntitlements: [
				createCustomerEntitlement({ id: "bucket_a", balance: 5 }),
				createCustomerEntitlement({ id: "bucket_b", balance: 20 }),
			],
		});
		const locked = takeLock({ state: twoBuckets, value: 8 });
		const [first, last] = locked.lock.deltas;
		if (!first || !last)
			throw new Error("Expected the lock to span two buckets");

		const { state } = finalize({ ...locked, finalValue: 5 });
		// Three units come back, and they land on the bucket drawn last.
		const lastBefore = balanceOf({ state: locked.state, id: last.id }) ?? 0;
		expect(balanceOf({ state, id: last.id })).toBe(lastBefore + 3);
		expect(balanceOf({ state, id: first.id })).toBe(
			balanceOf({ state: locked.state, id: first.id }),
		);
	});

	/** The plan went past due after the lock was taken, and the org blocks overdue usage. */
	const pastDue = ({ state }: { state: SubjectState }): SubjectState => ({
		...state,
		customerProducts: state.customerProducts.map((customerProduct) => ({
			...customerProduct,
			status: CusProductStatus.PastDue,
		})),
	});

	test.concurrent(
		"a release still lands on a row the overdue block leaves out of the selection",
		() => {
			const locked = takeLock({ state: createState(), value: 8 });
			const { state, mutation } = finalize({
				state: pastDue({ state: locked.state }),
				lock: locked.lock,
				finalValue: 0,
				blocksOverdue: true,
			});
			expect(mutation.result).toMatchObject({ status: "applied" });
			expect(balanceOf({ state })).toBe(10);
			expect(state.openLocks).toEqual([]);
		},
	);

	test.concurrent(
		"a confirm above the lock is refused while the plan is overdue, and the lock stays open",
		() => {
			const locked = takeLock({ state: createState(), value: 8 });
			const { state, mutation } = finalize({
				state: pastDue({ state: locked.state }),
				lock: locked.lock,
				finalValue: 9,
				blocksOverdue: true,
			});
			expect(mutation.result).toMatchObject({ status: "rejected" });
			expect(balanceOf({ state })).toBe(2);
			expect(state.openLocks).toHaveLength(1);
		},
	);

	/** A customer capped at `limit` tracked units a day. */
	const cappedState = ({ limit }: { limit: number }): SubjectState => {
		const state = createState({ balance: 100 });
		return {
			...state,
			customer: customerWith({
				usage_limits: [
					{
						feature_id: "messages",
						enabled: true,
						limit,
						interval: ResetInterval.Day,
					},
				],
			}),
		};
	};
	const windowUsageOf = ({ state }: { state: SubjectState }) =>
		state.usageWindows[0]?.usage;

	test.concurrent(
		"a confirm below the lock frees the usage window it counted",
		() => {
			const locked = takeLock({ state: cappedState({ limit: 5 }), value: 4 });
			expect(windowUsageOf({ state: locked.state })).toBe(4);
			const { state } = finalize({ ...locked, finalValue: 1 });
			expect(windowUsageOf({ state })).toBe(1);
			expect(balanceOf({ state })).toBe(99);
		},
	);

	test.concurrent(
		"a confirm above the lock is held to the window's headroom",
		() => {
			const locked = takeLock({ state: cappedState({ limit: 5 }), value: 3 });
			const refused = finalize({ ...locked, finalValue: 6 });
			expect(refused.mutation.result).toMatchObject({ status: "rejected" });
			expect(windowUsageOf({ state: refused.state })).toBe(3);

			const { state } = finalize({ ...locked, finalValue: 5 });
			expect(windowUsageOf({ state })).toBe(5);
			expect(balanceOf({ state })).toBe(95);
		},
	);

	test.concurrent(
		"what sat on a vanished row is returned to the rows held now",
		() => {
			const locked = takeLock({ state: createState(), value: 8 });
			// The plan changed mid-lock: the locked entitlement is gone, a fresh one took its place.
			const upgraded: SubjectState = {
				...locked.state,
				customerEntitlements: [
					createCustomerEntitlement({ id: "messages_pro", balance: 50 }),
				],
			};
			const { state } = finalize({
				state: upgraded,
				lock: locked.lock,
				finalValue: 0,
			});
			expect(state.openLocks).toEqual([]);
			expect(state.customerEntitlements.map((row) => row.id)).toEqual([
				"messages_pro",
			]);
		},
	);
});
