import {
	AffectedResource,
	type ApiVersion,
	ApiVersionClass,
	applyResponseVersionChanges,
	ErrCode,
	RecaseError,
	type TrackParams,
	type TrackResponseV2,
} from "@autumn/shared";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import { EventService } from "../../api/events/EventService.js";
import { getOrCreateCachedFullCustomer } from "../../customers/cusUtils/fullCustomerCacheUtils/getOrCreateCachedFullCustomer.js";
import { runRedisDeductionV2 } from "./redisTrackUtils/runRedisDeductionV2.js";
import { constructEvent, type EventInfo } from "./trackUtils/eventUtils.js";
import type { FeatureDeduction } from "./trackUtils/getFeatureDeductions.js";

export const runTrackV2 = async ({
	ctx,
	body,
	featureDeductions,
	apiVersion,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	featureDeductions: FeatureDeduction[];
	apiVersion?: ApiVersion;
}) => {
	// Validate: event_name cannot be used with overage_behavior: "reject"
	if (body.event_name && body.overage_behavior === "reject") {
		throw new RecaseError({
			message:
				'overage_behavior "reject" is not supported with event_name. Use feature_id or set overage_behavior to "cap".',
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	// 1. Get full customer from cache or DB
	const fullCustomer = await getOrCreateCachedFullCustomer({
		ctx,
		customerId: body.customer_id,
		customerData: body.customer_data,
		entityId: body.entity_id,
		entityData: body.entity_data,
		source: "runTrackV2",
	});

	// Clean properties
	const eventInfo: EventInfo = {
		event_name: body.feature_id || body.event_name || "",
		value: body.value ?? 1,
		properties: body.properties,
		timestamp: body.timestamp,
		idempotency_key: body.idempotency_key,
	};

	// If idempotency key is provided, insert event first
	if (body.idempotency_key) {
		const newEvent = constructEvent({
			ctx,
			eventInfo,
			internalCustomerId: fullCustomer.internal_id,
			internalEntityId: fullCustomer.entity?.internal_id ?? undefined,
			customerId: body.customer_id,
			entityId: body.entity_id,
		});

		await EventService.insert({
			db: ctx.db,
			event: newEvent,
		});

		body.skip_event = true;
	}

	// Try Redis deduction
	console.log("Deducting from Redis...");
	const response = await runRedisDeductionV2({
		ctx,
		fullCustomer,
		featureDeductions,
		overageBehavior: body.overage_behavior || "cap",
		body,
	});

	const transformedResponse = applyResponseVersionChanges<TrackResponseV2>({
		input: response,
		targetVersion: apiVersion
			? new ApiVersionClass(apiVersion)
			: ctx.apiVersion,
		resource: AffectedResource.Track,
		legacyData: {
			feature_id: body.feature_id || body.event_name,
		},
		ctx,
	});

	return transformedResponse;
};
