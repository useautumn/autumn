import type { DeductionState } from "../../../../deduction/types/deductionState.js";

/** What an unwind moved, in the shape a forward draw starts from, plus what it could not return. */
export type UnwoundLock = Pick<
	DeductionState,
	"deltas" | "usageWindowConsumed"
> & {
	/** Sat on a row that is gone (a plan changed mid-lock); settled against the rows held now. */
	skippedValue: number;
};
