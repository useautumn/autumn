import {
	type ApiVersion,
	ErrCode,
	RecaseError,
	type TrackParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { FeatureDeduction } from "../utils/types/featureDeduction.js";
import {
	getTokenCascadeDeductionsFromBody,
	getTrackFeatureDeductionsForBody,
} from "./utils/getFeatureDeductions.js";
import { runTrackV3 } from "./v3/runTrackV3.js";

export const getQueuedTrackFeatureDeductions = ({
	ctx,
	body,
	allowTokenCascade = false,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	allowTokenCascade?: boolean;
}): FeatureDeduction[] => {
	if (allowTokenCascade) {
		const cascadeDeductions = getTokenCascadeDeductionsFromBody({ ctx, body });
		if (!cascadeDeductions) {
			ctx.logger.warn(
				"[track] queued cascade marker invalid or incomplete; event will not be deducted",
				{
					type: "track_cascade_marker_invalid",
					customer_id: body.customer_id,
					entity_id: body.entity_id,
					feature_id: body.feature_id,
				},
			);
			throw new RecaseError({
				message: "Queued token cascade is missing a valid cascade marker",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
		return cascadeDeductions;
	}

	return getTrackFeatureDeductionsForBody({ ctx, body });
};

export const runQueuedTrack = async ({
	ctx,
	body,
	apiVersion,
	allowTokenCascade,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	apiVersion?: ApiVersion;
	allowTokenCascade?: boolean;
}) => {
	const featureDeductions = getQueuedTrackFeatureDeductions({
		ctx,
		body,
		allowTokenCascade,
	});

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
