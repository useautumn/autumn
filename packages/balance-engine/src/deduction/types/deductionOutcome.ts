import type { Decimal } from "decimal.js";
import type { RowChange } from "../../models/mutation/rowChange.js";
import type { DeductionLimitType } from "../utils/limits/deductionStateToLimitType.js";
import type { DeductionContext } from "./deductionContext.js";
import type { DeductionDelta } from "./deductionDelta.js";

export type DeductionOutcome = {
	context: DeductionContext;
	requestedValue: number;
	appliedValue: number;
	remaining: number;
	rejected: boolean;
	limitType: DeductionLimitType | null;
	deltas: DeductionDelta[];
	usageWindowConsumed: Map<string, Decimal>;
	allocationConsumed?: Map<string, Decimal>;
	changes: RowChange[];
};
