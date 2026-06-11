import type { UsageWindowDimension } from "../../../models/cusProductModels/cusEntModels/usageWindowModels.js";
import { FeatureType } from "../../../models/featureModels/featureEnums.js";
import type { Feature } from "../../../models/featureModels/featureModels.js";

/**
 * Which dimension a usage limit on `feature` counts against:
 * - a credit-system feature caps the credit POOL (`balance` dimension,
 *   counted in credits drained);
 * - any other feature caps that feature's own usage (`metered_feature`
 *   dimension, counted in tracked units).
 */
export const getUsageWindowDimension = ({
	feature,
}: {
	feature: Feature;
}): {
	dimensionType: UsageWindowDimension;
	dimensionFeatureId: string | null;
} => {
	const isCreditSystem = feature.type === FeatureType.CreditSystem;

	return {
		dimensionType: isCreditSystem ? "balance" : "metered_feature",
		dimensionFeatureId: isCreditSystem ? null : feature.id,
	};
};
