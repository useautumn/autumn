import {
	ErrCode,
	type Feature,
	fullCustomerToCustomerEntitlements,
	fullSubjectToFullCustomer,
	isAiCreditSystem,
	RecaseError,
	type TrackParams,
	type TrackTokensParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getOrSetCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/getOrSetCachedFullSubject.js";
import { getOrSetCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/getOrSetCachedFullCustomer.js";
import { getCreditCost } from "@/internal/features/creditSystemUtils.js";
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

const resolveAiCreditFeatureFromEntitlements = async ({
	ctx,
	customerId,
	entityId,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
}): Promise<Feature> => {
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

	const aiCreditFeatures = [
		...new Map(
			cusEnts
				.filter(
					(ce) => isAiCreditSystem(ce.entitlement.feature.type),
				)
				.map((ce) => [ce.entitlement.feature.id, ce.entitlement.feature]),
		).values(),
	];

	if (aiCreditFeatures.length === 0) {
		throw new RecaseError({
			message: "No AI credit system feature found for this customer",
			code: ErrCode.FeatureNotFound,
			statusCode: 404,
		});
	}
	if (aiCreditFeatures.length > 1) {
		throw new RecaseError({
			message:
				"Multiple AI credit system features found for this customer. Please specify a feature_id to disambiguate.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	return aiCreditFeatures[0];
};

export const getTokenTrackParams = async ({
	ctx,
	input,
}: {
	ctx: AutumnContext;
	input: TrackTokensParams;
}): Promise<{ body: TrackParams; featureDeductions: FeatureDeduction[] }> => {
	const aiCreditFeature = input.feature_id
		? resolveAiCreditFeatureById({
				features: ctx.features,
				featureId: input.feature_id,
			})
		: await resolveAiCreditFeatureFromEntitlements({
				ctx,
				customerId: input.customer_id,
				entityId: input.entity_id,
			});

	const cost = await getCreditCost({
		featureId: aiCreditFeature.id,
		creditSystem: aiCreditFeature,
		modelName: input.model_id,
		tokens: {
			input: input.input_tokens,
			output: input.output_tokens,
			cacheRead: input.cache_read_tokens,
			cacheWrite: input.cache_write_tokens,
			audioInput: input.audio_input_tokens,
			audioOutput: input.audio_output_tokens,
			reasoning: input.reasoning_tokens,
		},
	});

	const featureDeductions: FeatureDeduction[] = [
		{
			feature: aiCreditFeature,
			deduction: 1,
			tokenUsage: {
				modelName: input.model_id,
				inputTokens: input.input_tokens,
				outputTokens: input.output_tokens,
			},
			precomputedCreditCost: cost,
		},
	];

	const body: TrackParams = {
		customer_id: input.customer_id,
		entity_id: input.entity_id,
		feature_id: aiCreditFeature.id,
		value: cost,
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
			cost,
		},
		idempotency_key: input.idempotency_key,
		overage_behavior: input.overage_behavior,
		customer_data: input.customer_data,
		entity_data: input.entity_data,
		skip_event: input.skip_event,
	};

	return { body, featureDeductions };
};
