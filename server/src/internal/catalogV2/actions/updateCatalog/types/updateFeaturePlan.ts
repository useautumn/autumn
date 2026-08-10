import type { Feature, FeatureUsageType } from "@autumn/shared";

export type UpdateCreditSystemSchemaPlan = {
	id: string;
	config: Feature["config"];
};

export type FeatureTypeRewrite = "boolean_to_metered" | "metered_to_boolean";

/**
 * Reference rewrite intents for one feature update.
 * Entitlement/price writes are SQL batch UPDATEs in execute (org-scoped).
 * Credit-system schema patches stay explicit — nested jsonb map in JS.
 */
export type FeatureRewritePlan = {
	typeChange: FeatureTypeRewrite | null;
	idChange: { fromId: string; toId: string } | null;
	usageTypeChange: { nextUsageType: FeatureUsageType } | null;
	updateCreditSystemSchemas: UpdateCreditSystemSchemaPlan[];
};

export type UpdateFeaturePlan = {
	current: Feature;
	next: Feature;
	/** Changed ApiFeatureV1 fields holding previous values; null = nothing changed. */
	previousAttributes: Record<string, unknown> | null;
	/** Preview / response helper — from setup existence flags. */
	hasCustomerEntitlements: boolean;
	regenerateDisplay: boolean;
	clearCreditSystemCache: boolean;
	rewrites: FeatureRewritePlan;
};
