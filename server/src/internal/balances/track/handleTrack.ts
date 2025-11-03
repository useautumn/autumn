import {
	ApiVersion,
	ErrCode,
	RecaseError,
	SuccessCode,
	type TrackParams,
	TrackParamsSchema,
} from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { createRoute } from "../../../honoMiddlewares/routeHandler.js";
import { globalEventBatchingManager } from "./eventUtils/EventBatchingManager.js";
import { runRedisDeduction } from "./redisTrackUtils/runRedisDeduction.js";
import { globalSyncBatchingManager } from "./syncUtils/SyncBatchingManager.js";
import type { FeatureDeduction } from "./trackUtils/getFeatureDeductions.js";
import {
	getTrackEventNameDeductions,
	getTrackFeatureDeductions,
} from "./trackUtils/getFeatureDeductions.js";
import { runDeductionTx } from "./trackUtils/runDeductionTx.js";

/**
 * Execute PostgreSQL-based tracking with full transaction support
 */
const executePostgresTracking = async ({
	ctx,
	body,
	featureDeductions,
}: {
	ctx: RequestContext;
	body: TrackParams;
	featureDeductions: FeatureDeduction[];
}) => {
	const { event } = await runDeductionTx({
		ctx,
		customerId: body.customer_id,
		entityId: body.entity_id,
		deductions: featureDeductions,
		overageBehaviour: body.overage_behavior,
		eventInfo: {
			event_name: body.feature_id || body.event_name!,
			value: body.value ?? 1,
			properties: body.properties,
			timestamp: body.timestamp,
			idempotency_key: body.idempotency_key,
		},
	});

	return {
		id: event?.id || "",
		code: SuccessCode.EventReceived,
		customer_id: body.customer_id,
		entity_id: body.entity_id,
		feature_id: body.feature_id,
		event_name: body.event_name,
	};
};

export const handleTrack = createRoute({
	body: TrackParamsSchema,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");
		const { org, env } = ctx;

		// Legacy: support value in properties
		if (body.properties?.value) {
			body.value = body.properties.value;
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
					eventName: body.event_name!,
					value: body.value,
				});

		// Scenario 1: idempotency_key requires PostgreSQL (for event persistence)
		if (body.idempotency_key) {
			const response = await executePostgresTracking({
				ctx,
				body,
				featureDeductions,
			});

			if (ctx.apiVersion.gte(ApiVersion.V1_1)) return c.json(response);
			return c.json({ success: true });
		}

		// Scenario 2: Try Redis first, fallback to PostgreSQL if needed
		const result = await runRedisDeduction({
			ctx,
			customerId: body.customer_id,
			entityId: body.entity_id,
			featureDeductions,
			overageBehavior: body.overage_behavior || "cap",
		});

		// Fallback to PostgreSQL for continuous_use + overage features
		if (!result.success && result.error === "REQUIRES_POSTGRES_TRACKING") {
			const response = await executePostgresTracking({
				ctx,
				body,
				featureDeductions,
			});

			if (ctx.apiVersion.gte(ApiVersion.V1_1)) return c.json(response);
			return c.json({ success: true });
		}

		// Redis deduction successful: queue sync jobs and event insertion
		if (result.success) {
			for (const deduction of featureDeductions) {
				globalSyncBatchingManager.addSyncPair({
					customerId: body.customer_id,
					featureId: deduction.feature.id,
					orgId: org.id,
					env,
					entityId: body.entity_id,
				});
			}

			// Queue event insertion (skip if skip_event is true)
			if (!body.skip_event) {
				globalEventBatchingManager.addEvent({
					orgId: org.id,
					orgSlug: org.slug,
					env,
					customerId: body.customer_id,
					entityId: body.entity_id,
					eventName: body.feature_id || body.event_name!,
					value: body.value,
					properties: body.properties,
					timestamp: body.timestamp,
				});
			}

			const response = {
				id: "",
				code: SuccessCode.EventReceived,
				customer_id: body.customer_id,
				entity_id: body.entity_id,
				feature_id: body.feature_id,
				event_name: body.event_name,
			};

			if (ctx.apiVersion.gte(ApiVersion.V1_1)) return c.json(response);
			return c.json({ success: true });
		}

		// Redis deduction failed (e.g., insufficient balance)
		const response = {
			id: "",
			code: "insufficient_balance",
			customer_id: body.customer_id,
			entity_id: body.entity_id,
			feature_id: body.feature_id,
			event_name: body.event_name,
		};

		if (ctx.apiVersion.gte(ApiVersion.V1_1)) return c.json(response);
		return c.json({ success: false });
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
