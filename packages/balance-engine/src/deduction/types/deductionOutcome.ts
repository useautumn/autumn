import type { RowChange } from "../../models/mutation/rowChange.js";
import type { DeductionContext } from "./deductionContext.js";
import type { DeductionDelta } from "./deductionDelta.js";

/** What a deduction decided: how much moved, what is left, and the row changes that carry it. */
export type DeductionOutcome = {
	context: DeductionContext;
	requestedValue: number;
	appliedValue: number;
	remaining: number;
	/** The shortfall was refused under "reject": nothing in deltas or changes is written. */
	rejected: boolean;
	deltas: DeductionDelta[];
	changes: RowChange[];
};
