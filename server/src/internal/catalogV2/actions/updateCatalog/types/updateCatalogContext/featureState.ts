import type { Feature } from "@autumn/shared";

export type FeatureState = {
	has_customers: boolean;
	has_entitlements: boolean;
	has_pooled_entitlements: boolean;
	has_non_consumable_entitlements: boolean;
	has_loose_entitlements: boolean;
	has_entity_feature_entitlements: boolean;
	has_loose_entity_feature_entitlements: boolean;
	has_prices: boolean;
	credit_system_feature_ids: string[];
	creditSystems: Feature[];

	entitlementsOverflow: boolean;
	entityFeatureIdEntitlementsOverflow: boolean;
	pricesOverflow: boolean;
};
