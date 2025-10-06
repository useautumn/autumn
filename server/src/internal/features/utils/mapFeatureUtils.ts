import {
	type ApiFeature,
	ApiFeatureSchema,
	ApiFeatureType,
	type AppEnv,
	type CreditSchemaItem,
	type Feature,
	FeatureType,
	type FeatureUsageType,
} from "@autumn/shared";
import RecaseError from "@/utils/errorUtils.js";
import {
	constructBooleanFeature,
	constructCreditSystem,
	constructMeteredFeature,
} from "./constructFeatureUtils.js";

export const toApiFeature = ({ feature }: { feature: Feature }) => {
	// return FeatureResponseSchema.parse(feature);
	// 1. Get feature type
	let featureType = feature.type;
	if (feature.type == FeatureType.Metered) {
		featureType = feature.config.usage_type;
	}

	let creditSchema;
	if (feature.type == FeatureType.CreditSystem) {
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
		archived: feature.archived,
	});
};

export const fromApiFeature = ({
	apiFeature,
	orgId,
	env,
}: {
	apiFeature: ApiFeature;
	orgId: string;
	env: AppEnv;
}) => {
	const isMetered =
		apiFeature.type == ApiFeatureType.SingleUsage ||
		apiFeature.type == ApiFeatureType.ContinuousUse;

	const featureType: FeatureType = isMetered
		? FeatureType.Metered
		: (apiFeature.type as unknown as FeatureType);

	if (isMetered) {
		return constructMeteredFeature({
			featureId: apiFeature.id,
			name: apiFeature.name || "",
			usageType: apiFeature.type as unknown as FeatureUsageType,
			orgId,
			env,
		});
	}

	if (featureType == FeatureType.CreditSystem) {
		if (!apiFeature.credit_schema || apiFeature.credit_schema.length == 0) {
			throw new RecaseError({
				message: "Credit system schema is required",
				code: "CREDIT_SYSTEM_SCHEMA_REQUIRED",
				statusCode: 400,
			});
		}

		return constructCreditSystem({
			featureId: apiFeature.id,
			name: apiFeature.name || "",
			orgId,
			env,
			schema: apiFeature.credit_schema!,
		});
	}

	return constructBooleanFeature({
		featureId: apiFeature.id,
		name: apiFeature.name || "",
		orgId,
		env,
	});
};
