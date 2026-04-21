import type { ApiVersion, TrackParams, TrackResponseV3 } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	isFullSubjectRolloutEnabled,
	isRetryableFullSubjectRolloutError,
} from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import type { FeatureDeduction } from "../utils/types/featureDeduction.js";
import { runTrackV2 } from "./runTrackV2.js";
import { queueTrack } from "./utils/queueTrack.js";
import { runTrackV3 } from "./v3/runTrackV3.js";

const TRACK_V3_ENABLED = true;

export const shouldUseTrackV3 = ({ ctx }: { ctx: AutumnContext }): boolean =>
	TRACK_V3_ENABLED && isFullSubjectRolloutEnabled({ ctx });

export const runTrackWithRollout = async ({
	ctx,
	body,
	featureDeductions,
	apiVersion,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	featureDeductions: FeatureDeduction[];
	apiVersion?: ApiVersion;
}): Promise<TrackResponseV3> => {
	if (shouldUseTrackV3({ ctx })) {
		try {
			return await runTrackV3({
				ctx,
				body,
				featureDeductions,
				apiVersion,
			});
		} catch (error) {
			if (!isRetryableFullSubjectRolloutError({ error })) {
				throw error;
			}

			const queuedResponse = await queueTrack({ ctx, body });
			if (queuedResponse) return queuedResponse;

			throw error;
		}
	}

	return runTrackV2({
		ctx,
		body,
		featureDeductions,
		apiVersion,
	});
};
