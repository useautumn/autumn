import {
	AffectedResource,
	ErrCode,
	RecaseError,
	type TrackParams,
	TrackTokensParamsSchema,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getCreditCost } from "@/internal/features/creditSystemUtils.js";
import { runTrackV2 } from "@/internal/balances/track/runTrackV2.js";
import type { FeatureDeduction } from "../utils/types/featureDeduction.js";

export const handleTrackTokens = createRoute({
	body: TrackTokensParamsSchema,
	resource: AffectedResource.Track,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		// Auto-detect AI credit system feature
		const aiCreditFeature = body.feature_id
			? ctx.features.find((f) => f.id === body.feature_id)
			: ctx.features.find((f) => f.is_ai_credit_system === true);

		if (!aiCreditFeature) {
			throw new RecaseError({
				message: body.feature_id
					? `Feature ${body.feature_id} not found`
					: "No AI credit system feature found for this organization",
				code: ErrCode.FeatureNotFound,
				statusCode: 404,
			});
		}

		const featureDeductions: FeatureDeduction[] = [
			{
				feature: aiCreditFeature,
				deduction: 1,
				tokenUsage: {
					modelName: body.model,
					inputTokens: body.input_tokens,
					outputTokens: body.output_tokens,
				},
			},
		];

		// Compute the dollar cost so we can return it in the response
		const cost = await getCreditCost({
			featureId: aiCreditFeature.id,
			creditSystem: aiCreditFeature,
			modelName: body.model,
			tokens: {
				input: body.input_tokens,
				output: body.output_tokens,
			},
		});

		// Build TrackParams body — store model/tokens in properties for audit
		const trackBody: TrackParams = {
			customer_id: body.customer_id,
			entity_id: body.entity_id,
			feature_id: aiCreditFeature.id,
			value: cost,
			properties: {
				...body.properties,
				model: body.model,
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
