import type { Feature } from "@autumn/shared";

/**
 * Per-feature dependency state from setup. Existence flags always; rewrite
 * COUNTs (and overflow) only when the batch entry may rewrite references.
 */
export type FeatureState = {
	has_customers: boolean;
	has_entitlements: boolean;
	has_loose_entitlements: boolean;
	has_entity_feature_entitlements: boolean;
	has_loose_entity_feature_entitlements: boolean;
	has_prices: boolean;
	/** Credit systems from ctx.features whose schema references this feature. */
	credit_system_feature_ids: string[];
	/** Credit system Feature rows (same source), for id-rewrite schema updates. */
	creditSystems: Feature[];

	/** True when a rewrite COUNT exceeded FEATURE_REWRITE_ROW_LIMIT. */
	entitlementsOverflow: boolean;
	entityFeatureIdEntitlementsOverflow: boolean;
	pricesOverflow: boolean;
};
