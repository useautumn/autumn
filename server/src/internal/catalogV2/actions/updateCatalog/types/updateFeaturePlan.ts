import type { Feature, FeatureUsageType } from "@autumn/shared";

export type UpdateCreditSystemSchemaPlan = {
	id: string;
	config: Feature["config"];
};

export type FeatureTypeRewrite = "boolean_to_metered" | "metered_to_boolean";

export type FeatureRewritePlan = {
	typeChange: FeatureTypeRewrite | null;
	idChange: { fromId: string; toId: string } | null;
	usageTypeChange: { nextUsageType: FeatureUsageType } | null;
	updateCreditSystemSchemas: UpdateCreditSystemSchemaPlan[];
};

export type UpdateFeaturePlan = {
	current: Feature;
	next: Feature;
	previousAttributes: Record<string, unknown> | null;
	hasCustomerEntitlements: boolean;
	regenerateDisplay: boolean;
	clearCreditSystemCache: boolean;
	rewrites: FeatureRewritePlan;
};
