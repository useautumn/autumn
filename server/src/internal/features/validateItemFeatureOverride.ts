import {
	ErrCode,
	type Feature,
	FeatureType,
	FeatureUsageType,
	isAiCreditSystem,
	isAnyCreditSystem,
	type ProductItem,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import {
	validateCreditSystem,
	validateCreditSystemSchemaReferences,
} from "./featureUtils.js";

export const validateItemFeatureOverride = ({
	item,
	feature,
	features,
}: {
	item: ProductItem;
	feature?: Feature;
	features: Feature[];
}): void => {
	const featureOverride = item.config?.feature_override;
	if (!featureOverride) return;

	const invalid = (message: string): never => {
		throw new RecaseError({
			message: `${message} (feature: ${item.feature_id})`,
			code: ErrCode.InvalidProductItem,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	};

	if (!(feature && isAnyCreditSystem(feature.type))) {
		invalid("feature_override is only supported on credit system items");
		return;
	}
	if (featureOverride.schema && feature.type !== FeatureType.CreditSystem) {
		invalid(
			"feature_override.credit_schema is not supported on AI credit system items",
		);
	}
	if (featureOverride.markups && !isAiCreditSystem(feature.type)) {
		invalid(
			"feature_override.markups is only supported on AI credit system items",
		);
	}

	if (!featureOverride.schema) return;

	const config = {
		schema: featureOverride.schema,
		usage_type: FeatureUsageType.Single,
	};
	validateCreditSystem(config, feature.type);
	validateCreditSystemSchemaReferences({ config, allFeatures: features });

	for (const schemaItem of featureOverride.schema) {
		const referenced = features.find(
			(f) => f.id === schemaItem.metered_feature_id,
		);
		if (!referenced) {
			throw new RecaseError({
				message: `feature_override on ${feature.id} references unknown feature ${schemaItem.metered_feature_id}`,
				code: ErrCode.InvalidProductItem,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}
	}
};
