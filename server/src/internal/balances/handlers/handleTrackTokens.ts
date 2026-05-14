import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { runTrackV2 } from "@/internal/balances/track/runTrackV2.js";
import { getCreditCost } from "@/internal/features/creditSystemUtils.js";
import {
	AffectedResource,
	ErrCode,
	type Feature,
	RecaseError,
	Scopes,
	type TrackParams,
	TrackTokensParamsSchema,
} from "@autumn/shared";
import type { FeatureDeduction } from "../utils/types/featureDeduction.js";

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
		if (!candidate.is_ai_credit_system) {
			throw new RecaseError({
				message: `Feature ${featureId} is not an AI credit system feature`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
		return candidate;
	}

	const matches = features.filter((f) => f.is_ai_credit_system === true);
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

export const handleTrackTokens = createRoute({
	scopes: [Scopes.Balances.Write],
	body: TrackTokensParamsSchema,
	resource: AffectedResource.Track,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		const aiCreditFeature = resolveAiCreditFeature({
			features: ctx.features,
			featureId: body.feature_id,
		});

		const rawModelName = body.model_id;

		// Compute the dollar cost once and reuse it for both the response/event row
		// and the deduction layer (avoids a second getCreditCost call per entitlement).
		const cost = await getCreditCost({
			featureId: aiCreditFeature.id,
			creditSystem: aiCreditFeature,
			modelName: rawModelName,
			tokens: {
				input: body.input_tokens,
				output: body.output_tokens,
			},
		});

		const featureDeductions: FeatureDeduction[] = [
			{
				feature: aiCreditFeature,
				deduction: 1, // multiplied by per-entitlement credit_cost in the deduction layer (Postgres)
				tokenUsage: {
					modelName: rawModelName,
					inputTokens: body.input_tokens,
					outputTokens: body.output_tokens,
				},
				precomputedCreditCost: cost,
			},
		];

		// Build TrackParams body — store model/tokens in properties for audit
		const trackBody: TrackParams = {
			customer_id: body.customer_id,
			entity_id: body.entity_id,
			feature_id: aiCreditFeature.id,
			value: cost,
			properties: {
				...body.properties,
				model: rawModelName,
				input_tokens: body.input_tokens,
				output_tokens: body.output_tokens,
				cost,
			},
			idempotency_key: body.idempotency_key,
			overage_behavior: body.overage_behavior,
			customer_data: body.customer_data,
			entity_data: body.entity_data,
			skip_event: body.skip_event,
		};

		return c.json(
			await runTrackV2({
				ctx,
				body: trackBody,
				featureDeductions,
			}),
		);
	},
});
