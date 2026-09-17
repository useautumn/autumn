import type { Decimal } from "decimal.js";
import type { DeductionDelta } from "./deductionDelta.js";

/** A deduction in progress: what is still owed and every balance moved so far. Buckets take from it in place. */
export type DeductionState = {
	remaining: Decimal;
	deltas: DeductionDelta[];
};
