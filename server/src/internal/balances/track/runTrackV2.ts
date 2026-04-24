import {
	AffectedResource,
	ApiVersion,
	ApiVersionClass,
	applyResponseVersionChanges,
	ErrCode,
	RecaseError,
	type TrackParams,
	type TrackResponseV3,
} from "@autumn/shared";
import { getOrSetCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/getOrSetCachedFullCustomer.js";
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
	const { customer_id, entity_id } = body;
	const fullCustomer = ctx.apiVersion.gte(ApiVersion.V2_1)
		? await getOrSetCachedFullCustomer({
				ctx,
				customerId: customer_id,
				entityId: entity_id,
				source: "getCheckData",
			})
		: await getOrCreateCachedFullCustomer({
				ctx,
				params: body,
				source: "runTrackV2",
			});

	if (body.idempotency_key) {
		await handleEventIdempotencyKey({
			ctx,
			idempotencyKey: body.idempotency_key,
			customerId: body.customer_id,
		});
	}

	// Try Redis deduction - returns TrackResponseV3 (with ApiBalanceV1)
	const response: TrackResponseV3 = await runRedisTrack({
		ctx,
		fullCustomer,
		featureDeductions,
		overageBehavior: body.overage_behavior || "cap",
		body,
	});

	// Version changes will transform V3 -> V2 -> V1 -> V0 based on target API version
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
