import type {
	UsageWindowDimension,
	UsageWindowFeature,
} from "../../../models/cusProductModels/cusEntModels/usageWindowModels.js";
import { isAnyCreditSystem } from "../../featureUtils/classifyFeature/isAnyCreditSystem.js";

export const getUsageWindowDimension = ({
	feature,
}: {
	feature: UsageWindowFeature;
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
