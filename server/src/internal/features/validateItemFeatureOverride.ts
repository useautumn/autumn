import {
	ErrCode,
	type Feature,
	FeatureType,
	FeatureUsageType,
	type ProductItem,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import {
	validateCreditSystem,
	validateCreditSystemSchemaReferences,
} from "./featureUtils.js";

/** An item's feature_override is keyed like the feature config; each present
 * key fully replaces the feature's value for customers on the plan, and the
 * same feature-level validation rules apply, scoped to the item. */
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

	if (feature?.type !== FeatureType.CreditSystem) {
		throw new RecaseError({
			message: `feature_override is only supported on credit system items (feature: ${item.feature_id})`,
			code: ErrCode.InvalidProductItem,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	if (!featureOverride.schema) return;
	const config = {
		schema: featureOverride.schema,
		usage_type: FeatureUsageType.Single,
	};

	// Same bar as the feature-level schema: non-empty, unique metered features,
	// positive billing units, well-formed graduated tiers.
	validateCreditSystem(config, feature.type);

	// Referenced features must be leaves (metered single-use or AI credit).
	// No selfFeatureId tolerance here: the override always targets an existing
	// credit system, so a self-reference is plain nesting and gets rejected.
	validateCreditSystemSchemaReferences({
		config,
		allFeatures: features,
	});

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
