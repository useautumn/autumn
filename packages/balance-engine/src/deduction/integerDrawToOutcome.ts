import { Decimal } from "decimal.js";
import type { DeductionContext } from "./types/deductionContext.js";
import type { DeductionDelta } from "./types/deductionDelta.js";
import type { DeductionOutcome } from "./types/deductionOutcome.js";
import type { DeductionRequest } from "./types/deductionRequest.js";
import { deltasToRowChangesLean } from "./utils/deltasToRowChangesLean.js";
import { deductionStateToLimitType } from "./utils/limits/deductionStateToLimitType.js";

/**
 * `deductionStateToOutcome` for a draw `isIntegerDraw` admitted, in plain numbers: the value and every
 * balance are exact integers, so `value - remaining` and `remaining > 0` are what Decimal would give,
 * and the draw had no window or gate to turn into changes.
 */
export const integerDrawToOutcome = ({
	context,
	remaining,
	deltas,
	request,
}: {
	context: DeductionContext;
	remaining: number;
	deltas: DeductionDelta[];
	request: DeductionRequest;
}): DeductionOutcome => {
	const refusedAsOverdue =
		context.overdueBlocked && context.rows.length === 0 && remaining > 0;
	const rejected =
		refusedAsOverdue ||
		(remaining > 0 && request.terms.overageBehavior === "reject");
	return {
		context,
		requestedValue: request.value,
		appliedValue: request.value - remaining,
		remaining,
		rejected,
		limitType:
			remaining > 0
				? deductionStateToLimitType({
						context,
						deductionState: {
							remaining: new Decimal(remaining),
							terms: request.terms,
							deltas,
							usageWindowConsumed: new Map(),
						},
					})
				: null,
		deltas,
		usageWindowConsumed: new Map(),
		allocationConsumed: undefined,
		changes: rejected ? [] : deltasToRowChangesLean({ context, deltas }),
	};
};
