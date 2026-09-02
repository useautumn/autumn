import { USAGE_ATTRIBUTION_DIMENSION_SEPARATOR } from "../../../models/featureModels/featureConfig/creditConfig.js";

export const buildUsageAttributionKey = ({
	internalFeatureId,
	dimensionName,
}: {
	internalFeatureId: string;
	dimensionName?: string;
}): string =>
	dimensionName
		? `${internalFeatureId}${USAGE_ATTRIBUTION_DIMENSION_SEPARATOR}${dimensionName}`
		: internalFeatureId;
