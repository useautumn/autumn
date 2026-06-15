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
 * Resolve every AI credit system on the customer, ordered included-first. The
 * deduction engine settles them in one atomic pass: it drains included systems
 * (no overage) before overage systems, by interval then balance, and prices
 * each in its own cost domain — so any number of systems cascades naturally,
 * with included usage spent before the marked-up overage. Pass an explicit
 * feature_id to deduct from a single system instead.
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

	// Hand the engine every system and let its deduction sort order them: it
	// already drains included (no overage) before overage, by interval then
	// balance, so this stable included-first sort only decides which system is
	// reported as the cascade's primary.
	return [...aiCreditSystems]
		.sort(
			(left, right) =>
				Number(left.hasUsageAllowed) - Number(right.hasUsageAllowed),
		)
		.map((system) => system.feature);
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

	const isCascade = aiCreditFeatures.length >= 2;
	const primaryFeature = aiCreditFeatures[0];
	const primaryPricing = pricings[0];

	const tokenUsage = {
		modelName: input.model_id,
		inputTokens: input.input_tokens,
		outputTokens: input.output_tokens,
	};

	// One atomic deduction: the remaining systems ride along as spillover so the
	// engine settles every system in a single pass — draining included usage
	// first (capped), then each marked-up overage system, each priced in its own
	// cost domain.
	const featureDeductions: FeatureDeduction[] = [
		{
			feature: primaryFeature,
			deduction: 1,
			tokens: { usage: tokenUsage, cost: primaryPricing.cost },
			...(isCascade && {
				spillover: aiCreditFeatures.slice(1).map((feature, index) => ({
					feature,
					tokens: { usage: tokenUsage, cost: pricings[index + 1].cost },
				})),
			}),
		},
	];

	// Freeze each system's request-time price (ordered included-first) so a
	// queued replay re-settles the same cascade instead of re-resolving.
	const cascadeProperties = isCascade
		? {
				cascade: {
					systems: aiCreditFeatures.map((feature, index) => ({
						feature_id: feature.id,
						...buildPricingProperties(pricings[index]),
					})),
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
