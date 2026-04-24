import { ErrCode, RecaseError, type ApiVersion, type TrackParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getTrackFeatureDeductionsForBody } from "./utils/getFeatureDeductions.js";
import { runTrackV3 } from "./v3/runTrackV3.js";

export const runQueuedTrack = async ({
	ctx,
	body,
	apiVersion,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	apiVersion?: ApiVersion;
}) => {
	const featureDeductions = getTrackFeatureDeductionsForBody({ ctx, body });

	try {
		await runTrackV3({
			ctx,
			body,
			featureDeductions,
			apiVersion,
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
