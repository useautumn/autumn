import {
	ErrCode,
	type Feature,
	FeatureType,
	RecaseError,
	type TrackParams,
	type TrackTokensParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getCreditCost } from "@/internal/features/creditSystemUtils.js";
import type { FeatureDeduction } from "../../utils/types/featureDeduction.js";

const resolveAiCreditFeature = ({
	features,
	featureId,
}: {
	features: Feature[];
	featureId?: string;
}): Feature => {
	if (featureId) {
		const candidate = features.find((f) => f.id === featureId);
		if (!candidate) {
			throw new RecaseError({
				message: `Feature ${featureId} not found`,
				code: ErrCode.FeatureNotFound,
				statusCode: 404,
			});
		}
		if (candidate.type !== FeatureType.AiCreditSystem) {
			throw new RecaseError({
				message: `Feature ${featureId} is not an AI credit system feature`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
		return candidate;
	}

	const matches = features.filter((f) => f.type === FeatureType.AiCreditSystem);
	if (matches.length === 0) {
		throw new RecaseError({
			message: "No AI credit system feature found for this organization",
			code: ErrCode.FeatureNotFound,
			statusCode: 404,
		});
	}
	if (matches.length > 1) {
		throw new RecaseError({
			message:
				"Multiple AI credit system features found. Please specify a feature_id to disambiguate.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	return matches[0];
};

export const getTokenTrackParams = async ({
	ctx,
	input,
}: {
	ctx: AutumnContext;
	input: TrackTokensParams;
}): Promise<{ body: TrackParams; featureDeductions: FeatureDeduction[] }> => {
	const aiCreditFeature = resolveAiCreditFeature({
		features: ctx.features,
		featureId: input.feature_id,
	});

	const cost = await getCreditCost({
		featureId: aiCreditFeature.id,
		creditSystem: aiCreditFeature,
		modelName: input.model_id,
		tokens: {
			input: input.input_tokens,
			output: input.output_tokens,
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
