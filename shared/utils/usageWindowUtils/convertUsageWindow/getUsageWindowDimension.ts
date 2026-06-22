import type { UsageWindowDimension } from "../../../models/cusProductModels/cusEntModels/usageWindowModels.js";
import type { Feature } from "../../../models/featureModels/featureModels.js";
import { isAnyCreditSystem } from "../../featureUtils/classifyFeature/isAnyCreditSystem.js";

/**
 * Which dimension a usage limit on `feature` counts against:
 * - any credit-system feature (classic or AI token-based) caps the credit
 *   POOL (`balance` dimension, counted in credits drained);
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
	const isCreditSystem = isAnyCreditSystem(feature.type);

	return {
		dimensionType: isCreditSystem ? "balance" : "metered_feature",
		dimensionFeatureId: isCreditSystem ? null : feature.id,
	};
};
