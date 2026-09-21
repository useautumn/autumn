import {
	type CreateFeature,
	FeatureType,
	FeatureUsageType,
	isAnyCreditSystem,
} from "@autumn/shared";
import { createSchemaItem } from "../credit-systems/utils/creditSchemaUtils";

/**
 * Rebuilds a draft's config for a newly picked type instead of merging into the
 * config the previous type left behind. A rate card and model markups mean
 * nothing on a metered or boolean feature, and leaking them makes the create
 * request ship a `credit_schema` the API rejects with an opaque union error
 * about tiers the user never configured.
 */
export const applyFeatureType = ({
	feature,
	type,
}: {
	feature: CreateFeature;
	type: FeatureType;
}): CreateFeature => {
	if (isAnyCreditSystem(type)) {
		return {
			...feature,
			type,
			config: {
				schema: [createSchemaItem()],
				usage_type: FeatureUsageType.Single,
			},
		};
	}

	if (type === FeatureType.Boolean) {
		return { ...feature, type, config: {}, model_markups: null };
	}

	// Metered: keep a usage type the user already picked on this draft, so
	// switching away and back doesn't silently reset consumable.
	const usageType =
		feature.type === FeatureType.Metered
			? (feature.config?.usage_type ?? FeatureUsageType.Single)
			: FeatureUsageType.Single;

	return {
		...feature,
		type,
		config: { usage_type: usageType },
		model_markups: null,
	};
};
