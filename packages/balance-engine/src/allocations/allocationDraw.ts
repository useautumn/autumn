import { Decimal } from "decimal.js";
import type { DeductionContext } from "../deduction/types/deductionContext.js";
import type { DeductionDelta } from "../deduction/types/deductionDelta.js";
import type { DeductionRow } from "../deduction/types/deductionRow.js";
import type { DeductionState } from "../deduction/types/deductionState.js";
import {
	storedUsageOf,
	usageWindowsToRowChanges,
} from "../deduction/utils/limits/usageWindows.js";
import type { RowChange } from "../models/mutation/rowChange.js";
import { allocationGate } from "./allocationMath.js";
import type { AllocationGate } from "./resolveAllocationGate.js";

const consumedOf = ({
	deductionState,
	key,
}: {
	deductionState: DeductionState;
	key: string;
}) => deductionState.allocationConsumed?.get(key) ?? new Decimal(0);

const counterUsage = ({
	context,
	deductionState,
	counter,
}: {
	context: DeductionContext;
	deductionState: DeductionState;
	counter: AllocationGate["claimedCounter"];
}) =>
	storedUsageOf({ context, limit: counter }).plus(
		consumedOf({ deductionState, key: counter.key }),
	);

/** The shared credits drawn so far in this deduction, by anyone. */
const sharedDrawn = ({
	deductionState,
	gate,
}: {
	deductionState: DeductionState;
	gate: AllocationGate;
}) =>
	deductionState.deltas
		.filter((delta) => gate.sharedRowIds.has(delta.id))
		.reduce((sum, delta) => sum.minus(delta.balanceDelta), new Decimal(0));

const gateNow = ({
	context,
	deductionState,
	gate,
}: {
	context: DeductionContext;
	deductionState: DeductionState;
	gate: AllocationGate;
}) =>
	allocationGate({
		own:
			gate.ownRequested !== null && gate.entityCounter
				? {
						requested: gate.ownRequested,
						usage: counterUsage({
							context,
							deductionState,
							counter: gate.entityCounter,
						}).toNumber(),
					}
				: null,
		scale: gate.scale,
		heldUnused: new Decimal(gate.requestedTotal)
			.minus(
				counterUsage({ context, deductionState, counter: gate.claimedCounter }),
			)
			.toNumber(),
		sharedRemaining: new Decimal(gate.sharedRemaining)
			.minus(sharedDrawn({ deductionState, gate }))
			.toNumber(),
	});

const gateOf = ({
	context,
	row,
}: {
	context: DeductionContext;
	row: Pick<DeductionRow, "id" | "entityKey">;
}) =>
	row.entityKey === null ? (context.allocationGates.get(row.id) ?? null) : null;

const distinctGates = ({ context }: { context: DeductionContext }) => [
	...new Set(context.allocationGates.values()),
];

/** Credits a shared row may still give this subject: its own unused share, then credits nobody holds. Null when the row isn't gated. */
export const allocationHeadroomOf = ({
	context,
	deductionState,
	row,
}: {
	context: DeductionContext;
	deductionState: DeductionState;
	row: DeductionRow;
}): Decimal | null => {
	const gate = gateOf({ context, row });
	if (!gate) return null;
	const { ownUnused, unallocated } = gateNow({ context, deductionState, gate });
	return Decimal.max(0, new Decimal(ownUnused).plus(unallocated));
};

const addConsumed = ({
	deductionState,
	key,
	amount,
}: {
	deductionState: DeductionState;
	key: string;
	amount: Decimal;
}) => {
	deductionState.allocationConsumed ??= new Map();
	const consumed = deductionState.allocationConsumed;
	consumed.set(key, (consumed.get(key) ?? new Decimal(0)).plus(amount));
};

/** Gives `credits` back: the entity's counter drops, and claimed drops only by what falls back under its share. */
const releaseAllocation = ({
	context,
	deductionState,
	gate,
	credits,
}: {
	context: DeductionContext;
	deductionState: DeductionState;
	gate: AllocationGate;
	credits: Decimal;
}) => {
	if (!gate.entityCounter) return;
	const usage = counterUsage({
		context,
		deductionState,
		counter: gate.entityCounter,
	});
	const restored = Decimal.min(credits, Decimal.max(0, usage));
	if (restored.lte(0)) return;
	addConsumed({
		deductionState,
		key: gate.entityCounter.key,
		amount: restored.neg(),
	});
	if (gate.ownRequested === null) return;
	const claimedBefore = Decimal.min(usage, gate.ownRequested);
	const claimedAfter = Decimal.min(usage.minus(restored), gate.ownRequested);
	addConsumed({
		deductionState,
		key: gate.claimedCounter.key,
		amount: claimedAfter.minus(claimedBefore),
	});
};

/** Records a shared draw (all of it against the entity, its own-share part as claimed); a negative draw is a refund. */
export const consumeAllocation = ({
	context,
	deductionState,
	row,
	credits,
}: {
	context: DeductionContext;
	deductionState: DeductionState;
	row: DeductionRow;
	credits: Decimal;
}): void => {
	const gate = gateOf({ context, row });
	if (!gate || !gate.entityCounter || credits.isZero()) return;
	if (credits.lt(0)) {
		releaseAllocation({
			context,
			deductionState,
			gate,
			credits: credits.neg(),
		});
		return;
	}
	const { ownUnused } = gateNow({ context, deductionState, gate });
	addConsumed({ deductionState, key: gate.entityCounter.key, amount: credits });
	addConsumed({
		deductionState,
		key: gate.claimedCounter.key,
		amount: Decimal.min(credits, ownUnused),
	});
};

/** What a lock unwind frees on the allocation counters, in the shape a forward draw starts from. */
export const deltasToFreedAllocation = ({
	context,
	deltas,
}: {
	context: DeductionContext;
	deltas: DeductionDelta[];
}): Map<string, Decimal> | undefined => {
	const state = { allocationConsumed: undefined } as unknown as DeductionState;
	for (const gate of distinctGates({ context })) {
		const gated = deltas.filter(
			(delta) => gateOf({ context, row: delta }) === gate,
		);
		const net = gated.reduce(
			(sum, delta) => sum.plus(delta.balanceDelta),
			new Decimal(0),
		);
		// Unwinding a draw gives credits back; unwinding a refund takes them again.
		if (net.gt(0))
			releaseAllocation({ context, deductionState: state, gate, credits: net });
		const row = context.rows.find((candidate) => candidate.id === gated[0]?.id);
		if (net.lt(0) && row)
			consumeAllocation({
				context,
				deductionState: state,
				row,
				credits: net.neg(),
			});
	}
	return state.allocationConsumed;
};

/** Counter rows the draw moved, created on first use and restarted when their cycle rolled. */
export const allocationCountersToRowChanges = ({
	context,
	deductionState,
}: {
	context: DeductionContext;
	deductionState: DeductionState;
}): RowChange[] => {
	if (!deductionState.allocationConsumed) return [];
	return usageWindowsToRowChanges({
		context: {
			...context,
			usageWindowLimits: distinctGates({ context }).flatMap((gate) =>
				[gate.entityCounter, gate.claimedCounter].filter(
					(counter) => counter !== null,
				),
			),
		},
		deductionState: {
			...deductionState,
			usageWindowConsumed: deductionState.allocationConsumed,
		},
	});
};
