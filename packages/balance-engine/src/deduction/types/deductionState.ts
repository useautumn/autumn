import type { Decimal } from "decimal.js";
import type { DeductionDelta } from "./deductionDelta.js";
import type { DeductionTerms } from "./deductionRequest.js";

/** A deduction in progress: what is still owed, on what terms, every balance moved so far, and what each usage window has taken. Buckets take from it in place. */
export type DeductionState = {
	remaining: Decimal;
	terms: DeductionTerms;
	deltas: DeductionDelta[];
	/** By limit key, in the limit's own unit: tracked units for metered caps, credits for balance caps. */
	usageWindowConsumed: Map<string, Decimal>;
};
