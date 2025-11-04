import {
	ApiVersion,
	InsufficientBalanceError,
	SuccessCode,
	TrackParamsSchema,
} from "@autumn/shared";
import { createRoute } from "../../../honoMiddlewares/routeHandler.js";
import {
	getTrackEventNameDeductions,
	getTrackFeatureDeductions,
} from "./trackUtils/getFeatureDeductions.js";
import { runDeductionTx } from "./trackUtils/runDeductionTx.js";

export const handleTrack = createRoute({
	body: TrackParamsSchema,
	handler: async (c) => {
		// 1. Get feature deductions
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		// Legacy
		if (body.properties?.value) {
			body.value = body.properties.value;
		}

		// Build feature deductions
		const featureDeductions = body.feature_id
			? getTrackFeatureDeductions({
					ctx,
					featureId: body.feature_id,
					value: body.value,
				})
			: getTrackEventNameDeductions({
					ctx,
					eventName: body.event_name!,
					value: body.value,
				});

		try {
			const start = Date.now();

			// Skip additional_balance for negative amounts (returns/refunds)
			const skipAdditionalBalance = body.value !== undefined && body.value < 0;

			const { fullCus, event } = await runDeductionTx({
				ctx,
				customerId: body.customer_id,
				entityId: body.entity_id,
				deductions: featureDeductions,
				overageBehaviour: body.overage_behaviour,
				skipAdditionalBalance,
				eventInfo: {
					event_name: body.feature_id || body.event_name!,
					value: body.value ?? 1,
					properties: body.properties,
					timestamp: body.timestamp,
					idempotency_key: body.idempotency_key,
				},
			});

			const elapsed = Date.now() - start;
			ctx.logger.info(`[handleTrack] runDeductionTx ms: ${elapsed}`);

			const response: any = {
				id: event?.id || "",
				code: SuccessCode.EventReceived,
				customer_id: body.customer_id,
				entity_id: body.entity_id,
				feature_id: body.feature_id,
				event_name: body.event_name,
			};

			if (ctx.apiVersion.gte(ApiVersion.V1_1)) return c.json(response);
			return c.json({ success: true });
		} catch (error) {
			if (error instanceof InsufficientBalanceError) {
				return c.json({
					id: "",
					code: "insufficient_balance",
					customer_id: body.customer_id,
					entity_id: body.entity_id,
					feature_id: body.feature_id,
					event_name: body.event_name,
				});
			}
			throw error;
		}
	},
});
