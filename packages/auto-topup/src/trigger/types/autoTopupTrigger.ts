import type { AutoTopup } from "@autumn/shared";

export type AutoTopupTrigger = {
	featureId: string;
	reason: "balance_below_threshold" | "threshold_settlement";
	autoTopupConfig?: AutoTopup;
};
