import type { DeductionState } from "../../../../deduction/types/deductionState.js";

export type UnwoundLock = Pick<
	DeductionState,
	"deltas" | "usageWindowConsumed" | "allocationConsumed"
> & {
	skippedValue: number;
};
