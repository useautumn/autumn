import { ApiFeatureSchema, ApiFeatureType } from "@api/features/apiFeature.js";
import { ProductItemFeatureType } from "@models/productV2Models/productItemModels/productItemModels.js";
import type { CreditSchemaItem } from "../models/featureModels/featureConfig/creditConfig.js";
import { FeatureType } from "../models/featureModels/featureEnums.js";
import type { Feature } from "../models/featureModels/featureModels.js";

export const toApiFeature = ({ feature }: { feature: Feature }) => {
	let featureType: string = feature.type;

	if (feature.type === FeatureType.Metered) {
		featureType = feature.usage_type ?? ApiFeatureType.Boolean; // fallback;
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

export const featureToProductItemFeatureType = ({
	feature,
}: {
	feature: Feature;
}): ProductItemFeatureType => {
	if (feature.type === FeatureType.Boolean) {
		return ProductItemFeatureType.Static;
	} else if (feature.type === FeatureType.CreditSystem) {
		return ProductItemFeatureType.SingleUse;
	} else if (feature.usage_type) {
		return feature.usage_type as unknown as ProductItemFeatureType;
	}

	// fallback
	return ProductItemFeatureType.SingleUse;
};
