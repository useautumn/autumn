import {
	ErrCode,
	type Feature,
	fullCustomerToCustomerEntitlements,
	fullCustomerToOverageAllowedByFeatureId,
	fullSubjectToFullCustomer,
	isAiCreditSystem,
	RecaseError,
	type TrackParams,
	type TrackTokensParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getOrSetCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/getOrSetCachedFullSubject.js";
import { getOrSetCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/getOrSetCachedFullCustomer.js";
import {
	getModelCreditCostBreakdown,
	type ModelCostBreakdown,
} from "@/internal/features/aiCreditSystemUtils.js";
import { isFullSubjectRolloutEnabled } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import type { FeatureDeduction } from "../../utils/types/featureDeduction.js";

const resolveAiCreditFeatureById = ({
	features,
	featureId,
}: {
	features: Feature[];
	featureId: string;
}): Feature => {
	const candidate = features.find((f) => f.id === featureId);
	if (!candidate) {
		throw new RecaseError({
			message: `Feature ${featureId} not found`,
			code: ErrCode.FeatureNotFound,
			statusCode: 404,
		});
	}
	if (!isAiCreditSystem(candidate.type)) {
		throw new RecaseError({
			message: `Feature ${featureId} is not an AI credit system feature`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	return candidate;
};

/**
 * Resolve the customer's AI credit systems in deduction order. One system
 * resolves as-is. Two systems form a cascade when exactly one of them has a
 * usage-allowed entitlement: the other ("included") deducts first, floored at
 * zero, and the usage-allowed one ("overage") absorbs the remainder. Any other
 * shape is ambiguous and requires an explicit feature_id.
 */
const resolveAiCreditFeaturesFromEntitlements = async ({
	ctx,
	customerId,
	entityId,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
}): Promise<Feature[]> => {
	const fullCustomer = isFullSubjectRolloutEnabled({ ctx })
		? fullSubjectToFullCustomer({
				fullSubject: await getOrSetCachedFullSubject({
					ctx,
					customerId,
					entityId,
					source: "resolveAiCreditFeature",
				}),
			})
		: await getOrSetCachedFullCustomer({
				ctx,
				customerId,
				entityId,
				source: "resolveAiCreditFeature",
			});

	const entity = entityId
		? fullCustomer.entities?.find((e) => e.id === entityId)
		: undefined;

	const cusEnts = fullCustomerToCustomerEntitlements({
		fullCustomer,
		entity,
	});
	const featureIds = [
		...new Set(
			cusEnts
				.map((customerEntitlement) => customerEntitlement.entitlement.feature)
				.filter((feature) => isAiCreditSystem(feature.type))
				.map((feature) => feature.id),
		),
	];
	const overageAllowedByFeatureId = fullCustomerToOverageAllowedByFeatureId({
		fullCustomer,
		featureIds,
		internalEntityId: entity?.internal_id,
	});
	const nativeUsageAllowedFeatureIds = new Set(
		cusEnts
			.filter((customerEntitlement) => customerEntitlement.usage_allowed)
			.map((customerEntitlement) => customerEntitlement.entitlement.feature.id),
	);

	const systems = new Map<
		string,
		{ feature: Feature; hasUsageAllowed: boolean }
	>();
	for (const customerEntitlement of cusEnts) {
		const feature = customerEntitlement.entitlement.feature;
		if (!isAiCreditSystem(feature.type)) continue;

		const overageAllowedControl = overageAllowedByFeatureId[feature.id];
		let usageAllowed = customerEntitlement.usage_allowed === true;
		if (
			overageAllowedControl?.enabled === true &&
			!nativeUsageAllowedFeatureIds.has(feature.id)
		) {
			usageAllowed = true;
		} else if (overageAllowedControl?.enabled === false) {
			usageAllowed = false;
		}
		const existing = systems.get(feature.id);
		if (existing) {
			existing.hasUsageAllowed = existing.hasUsageAllowed || usageAllowed;
		} else {
			systems.set(feature.id, { feature, hasUsageAllowed: usageAllowed });
		}
	}

	const aiCreditSystems = [...systems.values()];

	if (aiCreditSystems.length === 0) {
		throw new RecaseError({
			message: "No AI credit system feature found for this customer",
			code: ErrCode.FeatureNotFound,
			statusCode: 404,
		});
	}
	if (aiCreditSystems.length === 1) {
		return [aiCreditSystems[0].feature];
	}

	if (aiCreditSystems.length === 2) {
		const included = aiCreditSystems.find((system) => !system.hasUsageAllowed);
		const overage = aiCreditSystems.find((system) => system.hasUsageAllowed);
		if (included && overage) {
			return [included.feature, overage.feature];
		}
	}

	throw new RecaseError({
		message:
			"Multiple AI credit system features found for this customer. Please specify a feature_id to disambiguate.",
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};

const buildPricingProperties = (pricing: ModelCostBreakdown) => ({
	cost: pricing.cost,
	base_cost: pricing.baseCost,
	markup: pricing.markup,
	markup_source: pricing.markupSource,
	tier_applied: pricing.tierApplied,
	rates: {
		input: pricing.rates.input,
		output: pricing.rates.output,
		cache_read: pricing.rates.cacheRead,
		cache_write: pricing.rates.cacheWrite,
		audio_input: pricing.rates.audioInput,
		audio_output: pricing.rates.audioOutput,
		reasoning: pricing.rates.reasoning,
	},
});

export const getTokenTrackParams = async ({
	ctx,
	input,
}: {
	ctx: AutumnContext;
	input: TrackTokensParams;
}): Promise<{ body: TrackParams; featureDeductions: FeatureDeduction[] }> => {
	const aiCreditFeatures = input.feature_id
		? [
				resolveAiCreditFeatureById({
					features: ctx.features,
					featureId: input.feature_id,
				}),
			]
		: await resolveAiCreditFeaturesFromEntitlements({
				ctx,
				customerId: input.customer_id,
				entityId: input.entity_id,
			});

	const pricings = await Promise.all(
		aiCreditFeatures.map((feature) =>
			getModelCreditCostBreakdown({
				modelName: input.model_id,
				creditSystem: feature,
				input: input.input_tokens,
				output: input.output_tokens,
				cacheRead: input.cache_read_tokens,
				cacheWrite: input.cache_write_tokens,
				audioInput: input.audio_input_tokens,
				audioOutput: input.audio_output_tokens,
				reasoning: input.reasoning_tokens,
			}),
		),
	);

	const isCascade = aiCreditFeatures.length === 2;
	const primaryFeature = aiCreditFeatures[0];
	const primaryPricing = pricings[0];

	const tokenUsage = {
		modelName: input.model_id,
		inputTokens: input.input_tokens,
		outputTokens: input.output_tokens,
	};

	// One atomic deduction: the included system is primary and the overage
	// system rides along as spillover, so the engine drains included first
	// (capped) and spills the remainder into overage in its own cost domain.
	const featureDeductions: FeatureDeduction[] = [
		{
			feature: primaryFeature,
			deduction: 1,
			tokens: { usage: tokenUsage, cost: primaryPricing.cost },
			...(isCascade && {
				spillover: [
					{
						feature: aiCreditFeatures[1],
						tokens: { usage: tokenUsage, cost: pricings[1].cost },
					},
				],
			}),
		},
	];

	const cascadeProperties = isCascade
		? {
				cascade: {
					included_feature_id: aiCreditFeatures[0].id,
					overage_feature_id: aiCreditFeatures[1].id,
					included: buildPricingProperties(pricings[0]),
					overage: buildPricingProperties(pricings[1]),
				},
			}
		: undefined;

	const body: TrackParams = {
		customer_id: input.customer_id,
		entity_id: input.entity_id,
		feature_id: primaryFeature.id,
		value: primaryPricing.cost,
		properties: {
			...input.properties,
			model: input.model_id,
			input_tokens: input.input_tokens,
			output_tokens: input.output_tokens,
			cache_read_tokens: input.cache_read_tokens,
			cache_write_tokens: input.cache_write_tokens,
			audio_input_tokens: input.audio_input_tokens,
			audio_output_tokens: input.audio_output_tokens,
			reasoning_tokens: input.reasoning_tokens,
			...buildPricingProperties(primaryPricing),
			...cascadeProperties,
		},
		idempotency_key: input.idempotency_key,
		overage_behavior: input.overage_behavior,
		customer_data: input.customer_data,
		entity_data: input.entity_data,
		skip_event: input.skip_event,
	};

	return { body, featureDeductions };
};
