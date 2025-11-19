import {
	ApiFeatureType,
	type ApiFeatureV0,
} from "@api/features/prevVersions/apiFeatureV0.js";
import type { UpdateFeatureParams } from "@api/features/updateFeatureParams.js";
import {
	FeatureType,
	FeatureUsageType,
} from "@models/featureModels/featureEnums.js";
import type { Feature } from "@models/featureModels/featureModels.js";
import { AppEnv } from "@models/genModels/genEnums.js";
import type { ApiFeatureV1 } from "../../api/features/apiFeatureV1.js";
import type {
	CreateFeatureV1Params,
	UpdateFeatureV1Params,
} from "../../api/models.js";
import {
	AffectedResource,
	ApiVersionClass,
	applyResponseVersionChanges,
	LATEST_VERSION,
} from "../../api/versionUtils/versionUtils.js";
import type { CreditSchemaItem } from "../../models/featureModels/featureConfig/creditConfig.js";
import { notNullish, nullish } from "../utils.js";

export const apiFeatureToDbFeature = ({
	apiFeature,
	originalFeature,
}: {
	apiFeature: ApiFeatureV0 | UpdateFeatureParams;
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
		newConfig.schema = apiFeature.credit_schema.map(
			(credit: { metered_feature_id: string; credit_cost: number }) => ({
				metered_feature_id: credit.metered_feature_id,
				credit_amount: credit.credit_cost,
			}),
		);
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
		event_names: [],
	} satisfies Feature;
};

export const featureV1ToDbFeatureConfig = ({
	apiFeature,
	originalFeature,
}: {
	apiFeature: UpdateFeatureV1Params;
	originalFeature: Feature;
}) => {
	const type = apiFeature.type || originalFeature.type;

	if (nullish(apiFeature.consumable) && nullish(apiFeature.credit_schema))
		return;

	if (type === FeatureType.Boolean) return;

	if (type === FeatureType.Metered) {
		const newUsageType = notNullish(apiFeature.consumable)
			? apiFeature.consumable
				? FeatureUsageType.Single
				: FeatureUsageType.Continuous
			: originalFeature.config?.usage_type;
		return {
			usage_type: newUsageType,
		};
	}

	if (type === FeatureType.CreditSystem) {
		const newSchema = notNullish(apiFeature.credit_schema)
			? apiFeature.credit_schema.map(
					(credit: { metered_feature_id: string; credit_cost: number }) => ({
						metered_feature_id: credit.metered_feature_id,
						credit_amount: credit.credit_cost,
					}),
				)
			: originalFeature.config?.schema;
		return {
			schema: newSchema,
			usage_type: FeatureUsageType.Single,
		};
	}

	return undefined;
};

export const featureV1ToDbFeature = ({
	apiFeature,
	originalFeature,
}: {
	apiFeature: ApiFeatureV1 | CreateFeatureV1Params;
	originalFeature?: Feature;
}) => {
	// Replace body...
	const featureType = apiFeature.type;
	const eventNames = apiFeature.event_names;

	const newConfig =
		featureType === FeatureType.Boolean
			? undefined
			: originalFeature?.config || {};

	if (apiFeature.type === FeatureType.Metered) {
		newConfig.usage_type = apiFeature.consumable
			? FeatureUsageType.Single
			: FeatureUsageType.Continuous;
	}

	if (apiFeature.credit_schema) {
		newConfig.usage_type = FeatureUsageType.Single;
		newConfig.schema = apiFeature.credit_schema.map(
			(credit: { metered_feature_id: string; credit_cost: number }) => ({
				metered_feature_id: credit.metered_feature_id,
				credit_amount: credit.credit_cost,
			}),
		);
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
		archived:
			"archived" in apiFeature
				? apiFeature.archived
				: (originalFeature?.archived ?? false),
		event_names: eventNames ?? [],
	} satisfies Feature;
};

/**
 * Converts a database feature to the V1 API format (latest format).
 *
 * Version handling:
 * - This function always returns ApiFeatureV1 (V2.0+ format)
 * - Automatic version transformation to older formats (V0) happens via V1.2_FeatureChange
 * - The transformation is applied by the middleware when handlers use resource: AffectedResource.Feature
 * - For API version V1_Beta and older, responses are automatically converted to ApiFeatureV0 format
 */
export const dbToApiFeatureV1 = ({
	dbFeature,
	targetVersion,
}: {
	dbFeature: Feature;
	targetVersion?: ApiVersionClass;
}) => {
	const result = {
		id: dbFeature.id,
		name: dbFeature.name,
		type: dbFeature.type,
		consumable:
			dbFeature.type === FeatureType.CreditSystem ||
			dbFeature.config?.usage_type === FeatureUsageType.Single,

		credit_schema: dbFeature.config?.schema?.map(
			(schema: CreditSchemaItem) => ({
				metered_feature_id: schema.metered_feature_id,
				credit_cost: schema.credit_amount,
			}),
		),
		event_names: dbFeature.event_names,
		archived: dbFeature.archived,

		display: dbFeature.display
			? {
					singular: dbFeature.display.singular,
					plural: dbFeature.display.plural,
				}
			: undefined,
	} satisfies ApiFeatureV1;

	return applyResponseVersionChanges({
		input: result,
		targetVersion: targetVersion ?? new ApiVersionClass(LATEST_VERSION),
		resource: AffectedResource.Feature,
	});
};

// export const fromApiFeature = ({
// 	apiFeature,
// 	orgId,
// 	env,
// }: {
// 	apiFeature: ApiFeatureV0;
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
