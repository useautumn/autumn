import type { CreditTier } from "../../../models/featureModels/featureConfig/creditConfig.js";

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
