import type { DeductionLimitType } from "../../../deduction/utils/limits/deductionStateToLimitType.js";

export type CheckResult = {
	allowed: boolean;
	reason: "insufficient_balance" | "feature_not_attached" | null;
	limitType: DeductionLimitType | null;
	requiredBalance: number;
	fundingFeatureId: string | null;
	isFlag: boolean;
};
