import {
	AffectedResource,
	type ApiVersion,
	ApiVersionClass,
	applyResponseVersionChanges,
	type CheckExpand,
	ErrCode,
	RecaseError,
	type TrackParams,
	type TrackResponseV2,
} from "@autumn/shared";
import { db } from "../../../db/initDrizzle";
import type { AutumnContext } from "../../../honoUtils/HonoEnv";
import { EventService } from "../../api/events/EventService";
import { CusService } from "../../customers/CusService";
import { runRedisDeduction } from "./redisTrackUtils/runRedisDeduction";
import { constructEvent, type EventInfo } from "./trackUtils/eventUtils";
import { executePostgresTracking } from "./trackUtils/executePostgresTracking";
import type { FeatureDeduction } from "./trackUtils/getFeatureDeductions";
import { getTrackBalancesResponse } from "./trackUtils/getTrackBalancesResponse";

export const runTrack = async ({
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

	const eventInfo: EventInfo = {
		event_name: body.feature_id || body.event_name || "",
		value: body.value ?? 1,
		properties: body.properties,
		timestamp: body.timestamp,
		idempotency_key: body.idempotency_key,
	};

	// If idempotency key is provided, insert event first
	if (body.idempotency_key) {
		const customer = await CusService.getFull({
			db,
			idOrInternalId: body.customer_id,
			orgId: ctx.org.id,
			env: ctx.env,
			entityId: body.entity_id,
		});

		const newEvent = constructEvent({
			ctx,
			eventInfo,
			internalCustomerId: customer?.internal_id ?? "",
			internalEntityId: customer?.entity?.internal_id ?? undefined,
			customerId: body.customer_id,
			entityId: body.entity_id,
		});

		await EventService.insert({
			db,
			event: newEvent,
		});

		body.skip_event = true;
	}

	const { fallback, balances } = await runRedisDeduction({
		ctx,
		query: {
			expand: ctx.expand as CheckExpand[],
			skip_cache: ctx.skipCache,
		},
		trackParams: body,
		featureDeductions,
		overageBehavior: body.overage_behavior || "cap",
		eventInfo,
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

		// console.log("Balances:", balances);
		const finalBalances = getTrackBalancesResponse({
			featureDeductions,
			features: ctx.features,
			balances,
		});

		response = {
			customer_id: body.customer_id,
			entity_id: body.entity_id,
			event_name: body.event_name,
			value: body.value ?? 1,
			balance: finalBalances.balance,
			balances: finalBalances.balances,
		};
	}

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
