import {
	ApiFeatureType,
	type ApiFeatureV0,
	type AppEnv,
	FeatureType,
	type FeatureUsageType,
} from "@autumn/shared";
import RecaseError from "@/utils/errorUtils.js";
import {
	constructBooleanFeature,
	constructCreditSystem,
	constructMeteredFeature,
} from "./constructFeatureUtils.js";

export const fromApiFeature = ({
	apiFeature,
	orgId,
	env,
}: {
	apiFeature: ApiFeatureV0;
	orgId: string;
	env: AppEnv;
}) => {
	const isMetered =
		apiFeature.type === ApiFeatureType.SingleUsage ||
		apiFeature.type === ApiFeatureType.ContinuousUse;

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

	if (featureType === FeatureType.CreditSystem) {
		if (!apiFeature.credit_schema || apiFeature.credit_schema.length === 0) {
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
