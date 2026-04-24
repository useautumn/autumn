import type { ApiVersion, TrackParams, TrackResponseV3 } from "@autumn/shared";
import { withRedisFailOpen } from "@/external/redis/utils/withRedisFailOpen.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isFullSubjectRolloutEnabled } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import type { FeatureDeduction } from "../utils/types/featureDeduction.js";
import { runTrackV2 } from "./runTrackV2.js";
import { queueTrack } from "./utils/queueTrack.js";
import { runTrackV3 } from "./v3/runTrackV3.js";

const TRACK_V3_ENABLED = true;

type RunTrackWithRolloutDeps = {
	withRedisFailOpen: typeof withRedisFailOpen;
	runTrackV2: typeof runTrackV2;
	runTrackV3: typeof runTrackV3;
	queueTrack: typeof queueTrack;
};

const defaultDeps: RunTrackWithRolloutDeps = {
	withRedisFailOpen,
	runTrackV2,
	runTrackV3,
	queueTrack,
};

export const shouldUseTrackV3 = ({ ctx }: { ctx: AutumnContext }): boolean =>
	TRACK_V3_ENABLED && isFullSubjectRolloutEnabled({ ctx });

export const runTrackWithRollout = async ({
	ctx,
	body,
	featureDeductions,
	apiVersion,
	deps = defaultDeps,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	featureDeductions: FeatureDeduction[];
	apiVersion?: ApiVersion;
	deps?: RunTrackWithRolloutDeps;
}): Promise<TrackResponseV3> => {
	if (shouldUseTrackV3({ ctx })) {
		return deps.withRedisFailOpen<TrackResponseV3>({
			source: "runTrackWithRollout",
			run: () =>
				deps.runTrackV3({
					ctx,
					body,
					featureDeductions,
					apiVersion,
				}),
			fallback: async (error) => {
				const queuedResponse = await deps.queueTrack({ ctx, body });
				if (queuedResponse) return queuedResponse;
				throw error;
			},
		});
	}

	return deps.runTrackV2({
		ctx,
		body,
		featureDeductions,
		apiVersion,
	});
};
