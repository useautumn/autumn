import { TrackParamsSchema, TrackQuerySchema } from "@autumn/shared";
import { createRoute } from "../../../honoMiddlewares/routeHandler.js";
import { runTrack } from "./runTrack.js";
import {
	getTrackEventNameDeductions,
	getTrackFeatureDeductions,
} from "./trackUtils/getFeatureDeductions.js";

export const handleTrack = createRoute({
	query: TrackQuerySchema,
	body: TrackParamsSchema,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		// Legacy: support value in properties
		if (body.properties?.value) {
			const parsedValue = Number(body.properties.value);
			if (!Number.isNaN(parsedValue)) {
				body.value = parsedValue;
			}
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

		const response = await runTrack({
			ctx,
			body,
			featureDeductions,
		});

		return c.json(response);
	},
});

// Original PostgreSQL-based implementation (commented out for reference)
// 1. Run track deduction tx

// try {
// 	const start = Date.now();
// 	const { fullCus, event } = await runDeductionTx({
// 		ctx,
// 		customerId: body.customer_id,
// 		entityId: body.entity_id,
// 		deductions: featureDeductions,
// 		overageBehavior: body.overage_behavior,
// 		eventInfo: {
// 			event_name: body.feature_id || body.event_name!,
// 			value: body.value ?? 1,
// 			properties: body.properties,
// 			timestamp: body.timestamp,
// 			idempotency_key: body.idempotency_key,
// 		},
// 	});

// 	const elapsed = Date.now() - start;
// 	ctx.logger.info(`[handleTrack] runDeductionTx ms: ${elapsed}`);

// 	const response: any = {
// 		id: event?.id || "",
// 		code: SuccessCode.EventReceived,
// 		customer_id: body.customer_id,
// 		entity_id: body.entity_id,
// 		feature_id: body.feature_id,
// 		event_name: body.event_name,
// 	};

// 	if (ctx.apiVersion.gte(ApiVersion.V1_1)) return c.json(response);
// 	return c.json({ success: true });
// } catch (error) {
// 	if (error instanceof InsufficientBalanceError) {
// 		return c.json({
// 			id: "",
// 			code: "insufficient_balance",
// 			customer_id: body.customer_id,
// 			entity_id: body.entity_id,
// 			feature_id: body.feature_id,
// 			event_name: body.event_name,
// 		});
// 	}
// 	throw error;
// }

// // Scenario 1: idempotency_key requires PostgreSQL (for event persistence)
// if (body.idempotency_key || hasContUseFeature) {
// 	const response = await executePostgresTracking({
// 		ctx,
// 		body,
// 		featureDeductions,
// 	});

// 	if (ctx.apiVersion.gte(ApiVersion.V1_1)) return c.json(response);
// 	return c.json({ success: true });
// }
