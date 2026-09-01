import type { Decimal } from "decimal.js";
import type { BalanceMutation } from "../../common/types/balanceMutation.js";

export type DeductionResult = {
	appliedValue: Decimal;
	remaining: Decimal;
	mutations: BalanceMutation[];
};
