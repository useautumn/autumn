import { ApiFeatureSchema } from "@api/features/apiFeature.js";
import type { CreditSchemaItem } from "../models/featureModels/featureConfig/creditConfig.js";
import { FeatureType } from "../models/featureModels/featureEnums.js";
import type { Feature } from "../models/featureModels/featureModels.js";
import { creditSystemContainsFeature } from "./featureUtils/creditSystemUtils.js";
// import {
// 	constructBooleanFeature,
// 	constructCreditSystem,
// 	constructMeteredFeature,
// } from "./featureUtils/constructFeatureUtils.js";

export const toApiFeature = ({ feature }: { feature: Feature }) => {
	// return FeatureResponseSchema.parse(feature);
	// 1. Get feature type
	let featureType = feature.type;
	if (feature.type === FeatureType.Metered) {
		featureType = feature.config.usage_type;
	}

	let creditSchema: CreditSchemaItem[] | undefined;
	if (feature.type === FeatureType.CreditSystem) {
		creditSchema = feature.config.schema.map((s: CreditSchemaItem) => ({
			metered_feature_id: s.metered_feature_id,
			credit_cost: s.credit_amount,
		}));
	}

	return ApiFeatureSchema.parse({
		id: feature.id,
		name: feature.name,
		type: featureType,
		display: {
			singular: feature.display?.singular || feature.name,
			plural: feature.display?.plural || feature.name,
		},
		credit_schema: creditSchema,
	});
};

export const getRelevantFeatures = ({
	features,
	featureId,
}: {
	features: Feature[];
	featureId: string;
}) => {
	return features.filter(
		(f) =>
			f.id === featureId ||
			creditSystemContainsFeature({
				creditSystem: f,
				meteredFeatureId: featureId,
			}),
	);
};
