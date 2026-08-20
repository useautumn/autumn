import {
	AffectedResource,
	ApiVersion,
	ApiVersionClass,
	applyResponseVersionChanges,
	ErrCode,
	type FullSubject,
	getRelevantFeatures,
	RecaseError,
	type TrackParams,
	type TrackResponseV3,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getTrackQueueIdempotencyKey } from "@/internal/balances/idempotency/trackQueueIdempotency.js";
import { getOrCreateCachedPartialFullSubject } from "@/internal/customers/cache/fullSubject/actions/partial/getOrCreateCachedPartialFullSubject.js";
import { getOrSetCachedPartialFullSubject } from "@/internal/customers/cache/fullSubject/actions/partial/getOrSetCachedPartialFullSubject.js";
import type { FeatureDeduction } from "../../utils/types/featureDeduction.js";
import { runRedisTrackV3 } from "./runRedisTrackV3.js";

const getTrackFullSubject = async ({
	ctx,
	body,
	featureDeductions,
	forceFresh = false,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	featureDeductions: FeatureDeduction[];
	forceFresh?: boolean;
}): Promise<FullSubject> => {
	const { customer_id, entity_id } = body;
	const featureIds = [
		...new Set(
			featureDeductions.flatMap((deduction) =>
				getRelevantFeatures({
					features: ctx.features,
					featureId: deduction.feature.id,
				}).map((feature) => feature.id),
			),
		),
	];

	return ctx.apiVersion.gte(ApiVersion.V2_1)
		? getOrSetCachedPartialFullSubject({
				ctx,
				customerId: customer_id,
				entityId: entity_id,
				featureIds,
				source: "runTrackV3",
				readFrom: forceFresh ? "primary" : undefined,
			})
		: getOrCreateCachedPartialFullSubject({
				ctx,
				params: body,
				featureIds,
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
		featureDeductions,
	});

	const redisIdempotencyKey = getTrackQueueIdempotencyKey({ ctx });

	const response: TrackResponseV3 = await runRedisTrackV3({
		ctx,
		fullSubject,
		featureDeductions,
		overageBehavior: body.overage_behavior || "cap",
		body,
		idempotencyKey: redisIdempotencyKey,
		refreshFullSubject: () =>
			getTrackFullSubject({
				ctx,
				body,
				featureDeductions,
				forceFresh: true,
			}),
	});

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
