import {
	type CreditSchemaOverrideItem,
	ErrCode,
	entitlementToCreditSystem,
	type Feature,
	FeatureType,
	FeatureUsageType,
	isAiCreditSystem,
	isAnyCreditSystem,
	isExcludedCreditSchemaItem,
	type ProductItem,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import {
	validateCreditSystem,
	validateCreditSystemSchemaReferences,
} from "./featureUtils.js";

const findDuplicateFeatureId = (schema: CreditSchemaOverrideItem[]) => {
	const seen = new Set<string>();
	for (const row of schema) {
		if (seen.has(row.metered_feature_id)) return row.metered_feature_id;
		seen.add(row.metered_feature_id);
	}
};

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

	// Excluding a feature that is gone, or was never there, changes nothing.
	for (const schemaItem of featureOverride.schema) {
		if (isExcludedCreditSchemaItem(schemaItem)) continue;
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

	const duplicateFeatureId = findDuplicateFeatureId(featureOverride.schema);
	if (duplicateFeatureId) {
		invalid(
			`feature_override.credit_schema lists ${duplicateFeatureId} more than once`,
		);
	}

	const config = {
		schema: entitlementToCreditSystem({
			entitlement: { feature, feature_override: featureOverride },
		}).config.schema,
		usage_type: FeatureUsageType.Single,
	};
	validateCreditSystem(config, feature.type);
	validateCreditSystemSchemaReferences({ config, allFeatures: features });
};
