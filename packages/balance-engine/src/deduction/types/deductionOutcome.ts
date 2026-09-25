import type { RowChange } from "../../models/mutation/rowChange.js";
import type { DeductionLimitType } from "../utils/limits/deductionStateToLimitType.js";
import type { DeductionContext } from "./deductionContext.js";
import type { DeductionDelta } from "./deductionDelta.js";
import type { DeductionRequest } from "./deductionRequest.js";
import type { DeductionState } from "./deductionState.js";

/** What a deduction decided: how much moved, what is left, and the row changes that carry it. */
export type DeductionOutcome = {
	request: DeductionRequest;
	context: DeductionContext;
	requestedValue: number;
	appliedValue: number;
	remaining: number;
	/** The shortfall was refused under "reject": nothing in deltas or changes is written. */
	rejected: boolean;
	/** The limit that left it short; null when the whole value was covered, or nothing funds the feature. */
	limitType: DeductionLimitType | null;
	deltas: DeductionDelta[];
	/** What each usage window took, so a later draw can start where this one left the caps. */
	usageWindowConsumed: DeductionState["usageWindowConsumed"];
	changes: RowChange[];
};
