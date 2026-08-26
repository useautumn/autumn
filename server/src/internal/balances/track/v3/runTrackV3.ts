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
import { getTrackQueueIdempotencyKey } from "@/internal/balances/idempotency/trackQueueIdempotency.js";
import { getOrCreateCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/getOrCreateCachedFullSubject.js";
import { getOrSetCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/getOrSetCachedFullSubject.js";
import type { FeatureDeduction } from "../../utils/types/featureDeduction.js";
import { runRedisTrackV3 } from "./runRedisTrackV3.js";
import { runWorkerTrackV3 } from "./runWorkerTrackV3.js";

const getTrackFullSubject = async ({
	ctx,
	body,
	forceFresh = false,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	forceFresh?: boolean;
}): Promise<FullSubject> => {
	const { customer_id, entity_id } = body;

	return ctx.apiVersion.gte(ApiVersion.V2_1)
		? getOrSetCachedFullSubject({
				ctx,
				customerId: customer_id,
				entityId: entity_id,
				source: "runTrackV3",
				staleWhileRevalidate: !forceFresh,
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

	const redisIdempotencyKey = getTrackQueueIdempotencyKey({ ctx });
	const overageBehavior = body.overage_behavior || "cap";
	const refreshFullSubject = () =>
		getTrackFullSubject({ ctx, body, forceFresh: true });

	// `null` whenever routing is off, unreachable, or this shape has no worker
	// equivalent — which is every request on a deploy without the routing env
	// var and edge config both in place.
	const routed = await runWorkerTrackV3({
		ctx,
		fullSubject,
		featureDeductions,
		overageBehavior,
		body,
		idempotencyKey: redisIdempotencyKey,
		refreshFullSubject,
	});

	const response: TrackResponseV3 =
		routed ??
		(await runRedisTrackV3({
			ctx,
			fullSubject,
			featureDeductions,
			overageBehavior,
			body,
			idempotencyKey: redisIdempotencyKey,
			refreshFullSubject,
		}));

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
