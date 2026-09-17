import type { CreditSchemaItem } from "../../../models/featureModels/featureConfig/creditConfig.js";
import { FeatureType } from "../../../models/featureModels/featureEnums.js";
import type { Feature } from "../../../models/featureModels/featureModels.js";
import { isAnyCreditSystem } from "../classifyFeature/isAnyCreditSystem.js";
import { creditSystemContainsFeature } from "../creditSystemUtils.js";

/** Adds the metered features each selected credit system draws from. */
export const addCreditSystemMeteredFeatureIds = ({
	features,
	featureIds,
}: {
	features: Feature[];
	featureIds: Set<string>;
}) => {
	for (const feature of features) {
		if (!isAnyCreditSystem(feature.type)) continue;
		if (!featureIds.has(feature.id)) continue;
		const schema: CreditSchemaItem[] | undefined = feature.config?.schema;
		for (const schemaItem of schema ?? []) {
			featureIds.add(schemaItem.metered_feature_id);
		}
	}
};

export const getCreditSystemsFromFeature = ({
	featureId,
	features,
}: {
	featureId: string;
	features: Feature[];
}) => {
	return features.filter(
		(f) =>
			f.type === FeatureType.CreditSystem &&
			f.id !== featureId &&
			creditSystemContainsFeature({
				creditSystem: f,
				meteredFeatureId: featureId,
			}),
	);
};
