import { ApiFeatureV0Schema } from "@api/features/prevVersions/apiFeatureV0.js";
import type { CreditSchemaItem } from "../models/featureModels/featureConfig/creditConfig.js";
import { FeatureType } from "../models/featureModels/featureEnums.js";
import type { Feature } from "../models/featureModels/featureModels.js";
import { hasCreditDimensionRules } from "./featureUtils/classifyFeature/hasCreditDimensionRules.js";
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

	let creditSchema:
		| Array<{ metered_feature_id: string; credit_cost: number }>
		| undefined;
	if (feature.type === FeatureType.CreditSystem && feature.config?.schema) {
		const canRepresentSchema = feature.config.schema.every(
			(item: CreditSchemaItem) =>
				item.tier_behavior !== "graduated" &&
				!hasCreditDimensionRules(item) &&
				(item.feature_amount === undefined || item.feature_amount === 1),
		);
		if (canRepresentSchema) {
			creditSchema = feature.config.schema.flatMap((item: CreditSchemaItem) =>
				item.tier_behavior === "graduated"
					? []
					: [
							{
								metered_feature_id: item.metered_feature_id,
								credit_cost: item.credit_amount,
							},
						],
			);
		}
	}

	return ApiFeatureV0Schema.parse({
		id: feature.id,
		name: feature.name,
		type: featureType,
		display: {
			singular: feature.display?.singular || feature.name,
			plural: feature.display?.plural || feature.name,
		},
		...(creditSchema === undefined ? {} : { credit_schema: creditSchema }),
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
