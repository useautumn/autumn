import {
	AffectedResource,
	ApiVersion,
	ApiVersionClass,
	applyResponseVersionChanges,
	ErrCode,
	type FullSubject,
	RecaseError,
	type TrackParams,
	type TrackResponseV3,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getOrCreateCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/getOrCreateCachedFullSubject.js";
import { getOrSetCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/getOrSetCachedFullSubject.js";
import type { FeatureDeduction } from "../../utils/types/featureDeduction.js";
import { releaseIdempotencyKey } from "@/internal/misc/idempotency/checkIdempotencyKey.js";
import { handleEventIdempotencyKey } from "../utils/handleEventIdempotencyKey.js";
import { runRedisTrackV3 } from "./runRedisTrackV3.js";
import { getTrackIdempotencyKey } from "./trackIdempotencyKey.js";

const getTrackFullSubject = async ({
	ctx,
	body,
}: {
	ctx: AutumnContext;
	body: TrackParams;
}): Promise<FullSubject> => {
	const { customer_id, entity_id } = body;

	return ctx.apiVersion.gte(ApiVersion.V2_1)
		? getOrSetCachedFullSubject({
				ctx,
				customerId: customer_id,
				entityId: entity_id,
				source: "runTrackV3",
			})
		: getOrCreateCachedFullSubject({
				ctx,
				params: body,
				source: "runTrackV3",
			});
};

export const runTrackV3 = async ({
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
	if (body.event_name && body.overage_behavior === "reject") {
		throw new RecaseError({
			message:
				'overage_behavior "reject" is not supported with event_name. Use feature_id or set overage_behavior to "cap".',
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const fullSubject = await getTrackFullSubject({
		ctx,
		body,
	});

	// Claim the user-supplied idempotency key BEFORE the deduction so concurrent
	// retries get a deterministic 409 instead of double-deducting. On failure,
	// the catch below RELEASES the claim so retries can succeed once the cause
	// (insufficient balance, transient Redis fault) is resolved. Fixes #1138.
	if (body.idempotency_key) {
		await handleEventIdempotencyKey({
			ctx,
			body,
		});
	}

	const redisIdempotencyKey = getTrackIdempotencyKey({ ctx });

	let response: TrackResponseV3;
	try {
		response = await runRedisTrackV3({
			ctx,
			fullSubject,
			featureDeductions,
			overageBehavior: body.overage_behavior || "cap",
			body,
			idempotencyKey: redisIdempotencyKey,
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

	return applyResponseVersionChanges<TrackResponseV3>({
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
};
