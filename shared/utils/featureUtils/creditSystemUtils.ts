import type { CreditSchemaItem } from "../../models/featureModels/featureConfig/creditConfig.js";
import { FeatureType } from "../../models/featureModels/featureEnums.js";
import type { Feature } from "../../models/featureModels/featureModels.js";

export const creditSystemContainsFeature = ({
	creditSystem,
	meteredFeatureId,
}: {
	creditSystem: Feature;
	meteredFeatureId: string;
}) => {
	if (creditSystem.type !== FeatureType.CreditSystem) {
		return false;
	}
	const schema: CreditSchemaItem[] = creditSystem.config.schema;

	for (const schemaItem of schema) {
		if (schemaItem.metered_feature_id === meteredFeatureId) {
			return true;
		}
	}

	return false;
};
