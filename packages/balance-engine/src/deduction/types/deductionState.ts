import type { Decimal } from "decimal.js";
import type { DeductionDelta } from "./deductionDelta.js";
import type { DeductionTerms } from "./deductionRequest.js";

export type DeductionState = {
	remaining: Decimal;
	terms: DeductionTerms;
	deltas: DeductionDelta[];
	usageWindowConsumed: Map<string, Decimal>;
	allocationConsumed?: Map<string, Decimal>;
};
