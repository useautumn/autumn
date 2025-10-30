import { TrackParamsSchema } from "@autumn/shared";
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

		const start = Date.now();
		await runDeductionTx({
			ctx,
			customerId: body.customer_id,
			entityId: body.entity_id,
			deductions: featureDeductions,
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

		return c.json({ success: true });
	},
});
