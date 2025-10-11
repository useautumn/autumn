import { type ApiFeature, ApiFeatureType } from "@api/features/apiFeature.js";
import type { UpdateFeatureParams } from "@api/features/updateFeatureParams.js";
import {
	FeatureType,
	type FeatureUsageType,
} from "@models/featureModels/featureEnums.js";
import type { Feature } from "@models/featureModels/featureModels.js";
import { AppEnv } from "@models/genModels/genEnums.js";

export const apiFeatureToDbFeature = ({
	apiFeature,
	originalFeature,
}: {
	apiFeature: ApiFeature | UpdateFeatureParams;
	originalFeature?: Feature;
}) => {
	// Replace body...
	let featureType = apiFeature.type as unknown as FeatureType;
	let usageType: FeatureUsageType | undefined;
	if (
		apiFeature.type === ApiFeatureType.SingleUsage ||
		apiFeature.type === ApiFeatureType.ContinuousUse
	) {
		featureType = FeatureType.Metered;
		usageType = apiFeature.type as unknown as FeatureUsageType;
	}

	const newConfig =
		featureType === FeatureType.Boolean
			? undefined
			: originalFeature?.config || {};

	if (usageType) {
		newConfig.usage_type = usageType;
	}

	if (apiFeature.credit_schema) {
		newConfig.schema = apiFeature.credit_schema.map((credit) => ({
			metered_feature_id: credit.metered_feature_id,
			credit_amount: credit.credit_cost,
		}));
	}

	return {
		internal_id: originalFeature?.internal_id ?? "",
		org_id: originalFeature?.org_id ?? "",
		created_at: originalFeature?.created_at ?? Date.now(),
		env: originalFeature?.env ?? AppEnv.Sandbox,

		id: apiFeature.id ?? originalFeature?.id ?? "",
		name: apiFeature.name ?? originalFeature?.name ?? "",
		type: featureType,
		config: newConfig,
		archived: apiFeature.archived ?? originalFeature?.archived ?? false,
	} satisfies Feature;
};

// export const fromApiFeature = ({
// 	apiFeature,
// 	orgId,
// 	env,
// }: {
// 	apiFeature: ApiFeature;
// 	orgId: string;
// 	env: AppEnv;
// }) => {
// 	const isMetered =
// 		apiFeature.type === ApiFeatureType.SingleUsage ||
// 		apiFeature.type === ApiFeatureType.ContinuousUse;

// 	const featureType: FeatureType = isMetered
// 		? FeatureType.Metered
// 		: (apiFeature.type as unknown as FeatureType);

// 	if (isMetered) {
// 		return constructMeteredFeature({
// 			featureId: apiFeature.id,
// 			name: apiFeature.name || "",
// 			usageType: apiFeature.type as unknown as FeatureUsageType,
// 			orgId,
// 			env,
// 		});
// 	}

// 	if (featureType === FeatureType.CreditSystem) {
// 		if (!apiFeature.credit_schema || apiFeature.credit_schema.length === 0) {
// 			throw new Error("Credit system schema is required");
// 		}

// 		return constructCreditSystem({
// 			featureId: apiFeature.id,
// 			name: apiFeature.name || "",
// 			orgId,
// 			env,
// 			schema: apiFeature.credit_schema!,
// 		});
// 	}

// 	return constructBooleanFeature({
// 		featureId: apiFeature.id,
// 		name: apiFeature.name || "",
// 		orgId,
// 		env,
// 	});
// };
