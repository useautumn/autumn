import type { AutoTopup } from "@autumn/shared";

/** One feature whose auto top-up job should run now, and why. */
export type AutoTopupTrigger = {
	featureId: string;
	reason: "balance_below_threshold" | "threshold_settlement";
	/** The enabled config that resolved for the feature; absent when only threshold billing fires. */
	autoTopupConfig?: AutoTopup;
};
