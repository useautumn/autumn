import type { Feature, ReserveParams } from "@autumn/shared";
export type FeatureDeduction = {
	feature: Feature;
	deduction: number;
	targetBalance?: number;
	reserve?: ReserveParams;
};
