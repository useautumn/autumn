import {
	type CreateFeature,
	CreateFeatureSchema,
	type Feature,
	FeatureType,
	isAnyCreditSystem,
} from "@autumn/shared";
import {
	validateCreditSystem,
	validateCreditSystemSchemaReferences,
	validateMeteredConfig,
} from "@/internal/features/featureUtils.js";

/** Normalize + validate a feature row's type/config before insert or update. */
export const validateFeature = ({
	data,
	allFeatures,
}: {
	data: CreateFeature;
	allFeatures: Feature[];
}): CreateFeature => {
	const featureType = data.type;
	let config = data.config;

	if (featureType === FeatureType.Metered) {
		config = validateMeteredConfig(config);
	} else if (isAnyCreditSystem(featureType)) {
		config = validateCreditSystem(config, featureType);
		if (featureType === FeatureType.CreditSystem) {
			validateCreditSystemSchemaReferences({
				config,
				allFeatures,
				selfFeatureId: data.id,
			});
		}
	}

	return CreateFeatureSchema.parse({ ...data, config });
};
