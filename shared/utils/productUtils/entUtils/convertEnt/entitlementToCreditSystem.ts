import { FeatureType } from "../../../../models/featureModels/featureEnums.js";
import type { Feature } from "../../../../models/featureModels/featureModels.js";
import type { EntitlementWithFeature } from "../../../../models/productModels/entModels/entModels.js";

/**
 * The effective credit system for an entitlement: the plan item's
 * feature_override is keyed like the feature config, so applying it is a
 * config spread (each present key fully replaces the feature's value).
 * Everything downstream keeps consuming a plain Feature, so schema math is
 * override-aware without new code paths.
 */
export const entitlementToCreditSystem = ({
	entitlement,
}: {
	entitlement: EntitlementWithFeature;
}): Feature => {
	const creditSystem = entitlement.feature;
	if (
		creditSystem.type !== FeatureType.CreditSystem ||
		!entitlement.feature_override
	) {
		return creditSystem;
	}

	return {
		...creditSystem,
		config: {
			...creditSystem.config,
			...entitlement.feature_override,
		},
	};
};
