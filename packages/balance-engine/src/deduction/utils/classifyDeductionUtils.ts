import type { DeductionContext } from "../types/deductionContext.js";
import type { DeductionState } from "../types/deductionState.js";

export const isRefund = ({
	deductionState,
}: {
	deductionState: DeductionState;
}): boolean => deductionState.remaining.lt(0);

/** "overflow" drops the floors; "cap" and "reject" keep them. */
export const allowsNegative = ({
	context,
}: {
	context: DeductionContext;
}): boolean => context.overageBehavior === "overflow";
