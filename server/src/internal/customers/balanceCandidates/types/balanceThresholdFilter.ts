import type { BalanceFilterOp, FeatureBalanceSortBasis } from "@autumn/shared";

export type BalanceThresholdFilter = {
	op: BalanceFilterOp;
	value: number;
	basis: FeatureBalanceSortBasis;
};
