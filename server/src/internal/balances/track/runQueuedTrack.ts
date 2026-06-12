import {
	type ApiVersion,
	ErrCode,
	RecaseError,
	type TrackParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { CascadeReplayState } from "../utils/types/cascadeReplayState.js";
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
	cascadeReplayState,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	allowTokenCascade?: boolean;
 	cascadeReplayState?: CascadeReplayState;
}): FeatureDeduction[] => {
	if (cascadeReplayState) {
		const cascadeDeductions = getTokenCascadeDeductionsFromBody({ ctx, body });
		if (!cascadeDeductions) {
			throw new RecaseError({
				message: "Queued cascade replay is missing a valid cascade marker",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		const overageDeduction = cascadeDeductions.find(
			(deduction) => deduction.cascade?.role === "overage",
		);
		if (!overageDeduction) {
			throw new RecaseError({
				message: "Queued cascade replay is missing an overage deduction",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		return [
			{
				...overageDeduction,
				deduction: overageDeduction.deduction * cascadeReplayState.spillRemaining,
				cascade: undefined,
			},
		];
	}

	if (allowTokenCascade) {
		const cascadeDeductions = getTokenCascadeDeductionsFromBody({ ctx, body });
		if (!cascadeDeductions) {
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
	cascadeReplayState,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	apiVersion?: ApiVersion;
	allowTokenCascade?: boolean;
	cascadeReplayState?: CascadeReplayState;
}) => {
	const featureDeductions = getQueuedTrackFeatureDeductions({
		ctx,
		body,
		allowTokenCascade,
		cascadeReplayState,
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
