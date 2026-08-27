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
import type { FeatureStripeMeter } from "@models/featureModels/featureTable.js";
import { AppEnv } from "@models/genModels/genEnums.js";
import { isAiCreditSystem } from "@utils/featureUtils/classifyFeature/isAiCreditSystem";
import type { ApiFeatureProcessors } from "../../api/features/components/processors.js";
import type { ApiFeatureV1 } from "../../api/features/apiFeatureV1.js";
import {
	type ApiCreditSchemaItem,
	isGraduatedCreditSchemaItem,
} from "../../api/features/creditRateCard.js";
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
import type { SharedContext } from "../../types/sharedContext.js";
import { notNullish, nullish } from "../utils.js";
import { buildAiCreditSystemConfig } from "./buildAiCreditSystemConfig.js";
import { isAnyCreditSystem } from "./classifyFeature/isAnyCreditSystem.js";

export const featureProcessorsToDbFields = ({
	processors,
	originalFeature,
}: {
	processors?: ApiFeatureProcessors | null;
	originalFeature?: Feature;
}): {
	stripe_product_id: string | null | undefined;
	stripe_meter: FeatureStripeMeter | null | undefined;
} => {
	const stripe = processors?.stripe;
	const stripe_product_id =
		stripe?.product_id !== undefined
			? stripe.product_id
			: originalFeature?.stripe_product_id;
	const stripe_meter =
		stripe?.meter_id !== undefined
			? {
					id: stripe.meter_id,
					event_name:
						originalFeature?.stripe_meter?.id === stripe.meter_id
							? (originalFeature.stripe_meter?.event_name ?? "")
							: "",
				}
			: originalFeature?.stripe_meter;

	return { stripe_product_id, stripe_meter };
};

export const featureToApiProcessors = (
	feature: Feature,
): ApiFeatureProcessors | undefined => {
	const product_id = feature.stripe_product_id ?? undefined;
	const meter_id = feature.stripe_meter?.id ?? undefined;
	if (!product_id && !meter_id) return undefined;

	return {
		stripe: {
			...(product_id ? { product_id } : {}),
			...(meter_id ? { meter_id } : {}),
		},
	};
};

export const apiCreditSchemaItemToDb = (
	credit: ApiCreditSchemaItem,
): CreditSchemaItem => {
	const base = {
		metered_feature_id: credit.metered_feature_id,
		...(credit.billing_units === undefined
			? {}
			: { feature_amount: credit.billing_units }),
	};

	if (isGraduatedCreditSchemaItem(credit)) {
		return {
			...base,
			tier_behavior: "graduated",
			tiers: credit.tiers.map((tier) => ({
				to: tier.to,
				credit_amount: tier.credit_cost,
			})),
		};
	}

	return { ...base, credit_amount: credit.credit_cost };
};

export const dbCreditSchemaItemToApi = (
	credit: CreditSchemaItem,
): ApiCreditSchemaItem => {
	const base = {
		metered_feature_id: credit.metered_feature_id,
		...(credit.feature_amount === undefined
			? {}
			: { billing_units: credit.feature_amount }),
	};

	if (credit.tier_behavior === "graduated") {
		return {
			...base,
			tier_behavior: "graduated",
			tiers: credit.tiers.map((tier) => ({
				to: tier.to,
				credit_cost: tier.credit_amount,
			})),
		};
	}

	return { ...base, credit_cost: credit.credit_amount };
};

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

	// Cloned — mutating the original's config in place would make the produced
	// row and originalFeature indistinguishable to diffing.
	const newConfig =
		featureType === FeatureType.Boolean
			? undefined
			: structuredClone(originalFeature?.config ?? {});

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
		model_markups: null,
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
	const hasProviderMarkups = "provider_markups" in apiFeature;
	const hasDefaultMarkup = "default_markup" in apiFeature;
	const hasInvoiceCredit = apiFeature.invoice_credit !== undefined;

	if (
		isAiCreditSystem(type) &&
		(isAiCreditSystem(apiFeature.type) ||
			hasDefaultMarkup ||
			hasProviderMarkups ||
			hasInvoiceCredit)
	) {
		const config = buildAiCreditSystemConfig({
			defaultMarkup: hasDefaultMarkup
				? apiFeature.default_markup
				: originalFeature.config?.default_markup,
			providerMarkups: hasProviderMarkups
				? apiFeature.provider_markups
				: originalFeature.config?.provider_markups,
		});
		return hasInvoiceCredit
			? { ...config, invoice_credit: apiFeature.invoice_credit }
			: config;
	}

	if (
		nullish(apiFeature.consumable) &&
		nullish(apiFeature.credit_schema) &&
		!hasInvoiceCredit
	)
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
			? apiFeature.credit_schema.map(apiCreditSchemaItemToDb)
			: originalFeature.config?.schema;
		return {
			...originalFeature.config,
			schema: newSchema,
			invoice_credit: hasInvoiceCredit
				? apiFeature.invoice_credit
				: originalFeature.config?.invoice_credit,
			usage_type: FeatureUsageType.Single,
		};
	}

	return undefined;
};

export const featureV1ToDbFeature = ({
	apiFeature,
	originalFeature,
}: {
	apiFeature: (ApiFeatureV1 | CreateFeatureV1Params) & {
		processors?: ApiFeatureProcessors;
	};
	originalFeature?: Feature;
}) => {
	// Replace body...
	const featureType = apiFeature.type;
	const eventNames = apiFeature.event_names;

	// Cloned — mutating the original's config in place would make the produced
	// row and originalFeature indistinguishable to diffing.
	const newConfig =
		featureType === FeatureType.Boolean
			? undefined
			: structuredClone(originalFeature?.config ?? {});

	if (apiFeature.type === FeatureType.Metered) {
		newConfig.usage_type = apiFeature.consumable
			? FeatureUsageType.Single
			: FeatureUsageType.Continuous;
	}

	if (isAiCreditSystem(apiFeature.type)) {
		Object.assign(
			newConfig,
			buildAiCreditSystemConfig({
				defaultMarkup: apiFeature.default_markup,
				providerMarkups: apiFeature.provider_markups,
			}),
		);
	}

	if (
		isAnyCreditSystem(apiFeature.type) &&
		apiFeature.invoice_credit !== undefined
	) {
		newConfig.invoice_credit = apiFeature.invoice_credit;
	}

	if (apiFeature.credit_schema) {
		newConfig.usage_type = FeatureUsageType.Single;
		newConfig.schema = apiFeature.credit_schema.map(apiCreditSchemaItemToDb);
	}

	const modelMarkups =
		apiFeature.model_markups ?? originalFeature?.model_markups ?? null;
	const processorFields = featureProcessorsToDbFields({
		processors: apiFeature.processors,
		originalFeature,
	});

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
		model_markups: modelMarkups,
		// Omitted display keeps the current (often LLM-generated) one.
		display:
			apiFeature.display?.singular != null && apiFeature.display?.plural != null
				? {
						singular: apiFeature.display.singular,
						plural: apiFeature.display.plural,
					}
				: (originalFeature?.display ?? null),
		stripe_product_id: processorFields.stripe_product_id,
		stripe_meter: processorFields.stripe_meter,
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
	ctx,
	dbFeature,
	targetVersion,
}: {
	ctx: SharedContext;
	dbFeature: Feature;
	targetVersion?: ApiVersionClass;
}) => {
	const result = {
		id: dbFeature.id,
		name: dbFeature.name,
		type: dbFeature.type,
		consumable:
			isAnyCreditSystem(dbFeature.type) ||
			dbFeature.config?.usage_type === FeatureUsageType.Single,

		credit_schema: Array.isArray(dbFeature.config?.schema)
			? dbFeature.config.schema.map(dbCreditSchemaItemToApi)
			: undefined,
		invoice_credit:
			dbFeature.type === FeatureType.CreditSystem
				? (dbFeature.config?.invoice_credit ?? undefined)
				: undefined,
		model_markups: dbFeature.model_markups ?? undefined,
		default_markup: dbFeature.config?.default_markup ?? undefined,
		provider_markups: dbFeature.config?.provider_markups ?? undefined,
		event_names: Array.isArray(dbFeature.event_names)
			? dbFeature.event_names
			: [],
		archived: dbFeature.archived,

		display: dbFeature.display
			? {
					singular: dbFeature.display.singular,
					plural: dbFeature.display.plural,
				}
			: undefined,
		processors: featureToApiProcessors(dbFeature),
	} satisfies ApiFeatureV1;

	return applyResponseVersionChanges({
		input: result,
		targetVersion: targetVersion ?? new ApiVersionClass(LATEST_VERSION),
		resource: AffectedResource.Feature,
		ctx,
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
