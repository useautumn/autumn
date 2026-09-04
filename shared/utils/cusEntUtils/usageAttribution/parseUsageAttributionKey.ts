import { USAGE_ATTRIBUTION_DIMENSION_SEPARATOR } from "../../../models/featureModels/featureConfig/creditConfig.js";

export type ParsedUsageAttributionKey = {
	internalFeatureId: string;
	dimensionName?: string;
};

export const parseUsageAttributionKey = ({
	key,
}: {
	key: string;
}): ParsedUsageAttributionKey => {
	const separatorIndex = key.indexOf(USAGE_ATTRIBUTION_DIMENSION_SEPARATOR);
	if (separatorIndex === -1) return { internalFeatureId: key };

	return {
		internalFeatureId: key.slice(0, separatorIndex),
		dimensionName: key.slice(
			separatorIndex + USAGE_ATTRIBUTION_DIMENSION_SEPARATOR.length,
		),
	};
};
