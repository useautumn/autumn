import { Decimal } from "decimal.js";
import type { DeductionContext } from "../deduction/types/deductionContext.js";
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

const gates = ({
	context,
	row,
}: {
	context: DeductionContext;
	row: DeductionRow;
}) =>
	context.allocationGate?.sharedRowIds.has(row.id) && row.entityKey === null
		? context.allocationGate
		: null;

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
	const gate = gates({ context, row });
	if (!gate) return null;
	const { ownUnused, unallocated } = gateNow({ context, deductionState, gate });
	return Decimal.max(0, new Decimal(ownUnused).plus(unallocated));
};

/** Records a shared draw: all of it against the entity, only the part from its own share as claimed. */
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
	const gate = gates({ context, row });
	if (!gate || credits.lte(0) || !gate.entityCounter) return;
	const { ownUnused } = gateNow({ context, deductionState, gate });
	deductionState.allocationConsumed ??= new Map();
	const consumed = deductionState.allocationConsumed;
	const add = (key: string, amount: Decimal) =>
		consumed.set(key, (consumed.get(key) ?? new Decimal(0)).plus(amount));
	add(gate.entityCounter.key, credits);
	add(gate.claimedCounter.key, Decimal.min(credits, ownUnused));
};

/** Counter rows the draw moved, created on first use and restarted when their cycle rolled. */
export const allocationCountersToRowChanges = ({
	context,
	deductionState,
}: {
	context: DeductionContext;
	deductionState: DeductionState;
}): RowChange[] => {
	const gate = context.allocationGate;
	if (!gate || !deductionState.allocationConsumed) return [];
	return usageWindowsToRowChanges({
		context: {
			...context,
			usageWindowLimits: [gate.entityCounter, gate.claimedCounter].filter(
				(counter) => counter !== null,
			),
		},
		deductionState: {
			...deductionState,
			usageWindowConsumed: deductionState.allocationConsumed,
		},
	});
};
