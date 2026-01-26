import {
	AffectedResource,
	type ApiVersion,
	ApiVersionClass,
	applyResponseVersionChanges,
	ErrCode,
	RecaseError,
	type TrackParams,
	type TrackResponseV3,
} from "@autumn/shared";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import { getOrCreateCachedFullCustomer } from "../../customers/cusUtils/fullCustomerCacheUtils/getOrCreateCachedFullCustomer.js";
import type { FeatureDeduction } from "../utils/types/featureDeduction.js";
import { handleEventIdempotencyKey } from "./utils/handleEventIdempotencyKey.js";
import { runRedisTrack } from "./utils/runRedisTrack.js";

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
		params: body,
		source: "runTrackV2",
	});

	// If idempotency key is provided, insert event first and skip insertion later
	if (body.idempotency_key) {
		await handleEventIdempotencyKey({
			ctx,
			body,
			fullCustomer,
		});
	}

	// Try Redis deduction
	const { response } = await runRedisTrack({
		ctx,
		fullCustomer,
		featureDeductions,
		overageBehavior: body.overage_behavior || "cap",
		body,
	});

	const transformedResponse = applyResponseVersionChanges<TrackResponseV3>({
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
