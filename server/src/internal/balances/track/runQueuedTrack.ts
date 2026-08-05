import {
	type ApiVersion,
	ErrCode,
	RouteGroup,
	RecaseError,
	type TrackParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getTrackBodyIdempotencyKey } from "@/internal/balances/idempotency/trackBodyIdempotencyKey.js";
import { withIdempotencyKey } from "@/internal/misc/idempotency/withIdempotencyKey.js";
import { getTrackFeatureDeductionsForBody } from "./utils/getFeatureDeductions.js";
import { runTrackV3 } from "./v3/runTrackV3.js";

export const runQueuedTrack = async ({
	ctx,
	body,
	apiVersion,
	validateTrackBodyIdempotencyKey = true,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	apiVersion?: ApiVersion;
	/** Sync-originated replays already claimed the body key at accept time
	 *  (queueTrack marks them false); async/batch messages have no accept-time
	 *  claim, so the worker's claim is their only body-key dedup. */
	validateTrackBodyIdempotencyKey?: boolean;
}) => {
	const featureDeductions = getTrackFeatureDeductionsForBody({ ctx, body });

	try {
		await withIdempotencyKey({
			ctx,
			idempotencyKey: validateTrackBodyIdempotencyKey
				? getTrackBodyIdempotencyKey({ body })
				: null,
			routeGroup: RouteGroup.Balances,
			run: () =>
				runTrackV3({
					ctx,
					body,
					featureDeductions,
					apiVersion,
				}),
		});
	} catch (error) {
		if (
			!(error instanceof RecaseError) ||
			error.code !== ErrCode.DuplicateIdempotencyKey
		) {
			throw error;
		}

		ctx.logger.info("[track] queued replay already applied", {
			type: "track_queue_replay_duplicate",
			customer_id: body.customer_id,
			entity_id: body.entity_id,
			feature_id: body.feature_id,
			event_name: body.event_name,
		});
	}
};
