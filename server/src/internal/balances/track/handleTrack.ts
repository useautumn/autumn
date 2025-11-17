import {
	AffectedResource,
	applyResponseVersionChanges,
	ErrCode,
	RecaseError,
	TrackParamsSchema,
	TrackQuerySchema,
	type TrackResponseV2,
} from "@autumn/shared";
import { createRoute } from "../../../honoMiddlewares/routeHandler.js";
import { runRedisDeduction } from "./redisTrackUtils/runRedisDeduction.js";
import { executePostgresTracking } from "./trackUtils/executePostgresTracking.js";
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
		const query = c.req.valid("query");

		// Legacy: support value in properties
		if (body.properties?.value) {
			const parsedValue = Number(body.properties.value);
			if (!Number.isNaN(parsedValue)) {
				body.value = parsedValue;
			}
		}

		// Validate: event_name cannot be used with overage_behavior: "reject"
		if (body.event_name && body.overage_behavior === "reject") {
			throw new RecaseError({
				message:
					'overage_behavior "reject" is not supported with event_name. Use feature_id or set overage_behavior to "cap".',
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
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
					// biome-ignore lint/style/noNonNullAssertion: event name will be provided here
					eventName: body.event_name!,
					value: body.value,
				});

		const { fallback, balances } = await runRedisDeduction({
			ctx,
			query,
			trackParams: body,
			featureDeductions,
			overageBehavior: body.overage_behavior || "cap",
			eventInfo: {
				event_name: body.feature_id || body.event_name || "",
				value: body.value ?? 1,
				properties: body.properties,
				timestamp: body.timestamp,
				idempotency_key: body.idempotency_key,
			},
		});

		let response: TrackResponseV2;
		if (fallback) {
			response = await executePostgresTracking({
				ctx,
				body,
				featureDeductions,
			});
		} else {
			// Clean balances

			if (balances && Object.keys(balances).length > 0) {
				for (const balance of Object.values(balances)) {
					balance.feature = undefined;
				}
			}

			response = {
				customer_id: body.customer_id,
				entity_id: body.entity_id,
				event_name: body.event_name,
				value: body.value ?? 1,
				balance:
					balances && Object.keys(balances).length === 1
						? Object.values(balances)[0]
						: null,
				balances:
					balances && Object.keys(balances).length > 1 ? balances : undefined,
			};
		}

		const transformedResponse = applyResponseVersionChanges<TrackResponseV2>({
			input: response,
			targetVersion: ctx.apiVersion,
			resource: AffectedResource.Track,
			legacyData: {
				feature_id: body.feature_id || body.event_name,
			},
		});

		return c.json(transformedResponse);
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
