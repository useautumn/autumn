import type { Feature, LockParams } from "@autumn/shared";
export type FeatureDeduction = {
	feature: Feature;
	deduction: number;
	targetBalance?: number;
	lock?: LockParams;

	lockReceiptKey?: string;
	unwindValue?: number;
};
