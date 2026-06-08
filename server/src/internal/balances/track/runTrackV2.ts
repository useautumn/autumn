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
import { releaseIdempotencyKey } from "@/internal/misc/idempotency/checkIdempotencyKey.js";
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

	// If idempotency key is provided, CLAIM it BEFORE the deduction so concurrent
	// retries get a deterministic 409 instead of double-deducting. If the deduction
	// then fails (insufficient balance, transient Redis fault, etc.), the catch
	// block below RELEASES the claim so the caller can safely retry once the
	// failure cause is resolved. Fixes #1138 — previously the claim was permanent
	// on first failure and 409'd retries for the full 24h TTL.
	if (body.idempotency_key) {
		await handleEventIdempotencyKey({
			ctx,
			body,
		});
	}

	let response: TrackResponseV3;
	try {
		// Try Redis deduction - returns TrackResponseV3 (with ApiBalanceV1)
		response = await runRedisTrack({
			ctx,
			fullCustomer,
			featureDeductions,
			overageBehavior: body.overage_behavior || "cap",
			body,
		});
	} catch (error) {
		if (body.idempotency_key) {
			await releaseIdempotencyKey({
				orgId: ctx.org.id,
				env: ctx.env,
				idempotencyKey: `track:${body.idempotency_key}`,
				logger: ctx.logger,
			});
		}
		throw error;
	}

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
