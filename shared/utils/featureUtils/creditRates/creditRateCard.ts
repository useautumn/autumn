import type { CreditTier } from "../../../models/featureModels/featureConfig/creditConfig.js";

/** The rate one entitlement charges a source feature at: flat, or graduated over the units already attributed to it. */
export type CreditRateCard = {
	source_internal_feature_id: string;
	feature_amount: number;
} & (
	| {
			credit_amount: number;
			tier_behavior?: never;
			tiers?: never;
	  }
	| {
			credit_amount?: never;
			tier_behavior: "graduated";
			tiers: CreditTier[];
	  }
);
