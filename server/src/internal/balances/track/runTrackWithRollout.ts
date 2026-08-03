import type { ApiVersion, TrackParams, TrackResponseV3 } from "@autumn/shared";
import { withRedisFailOpen } from "@/external/redis/utils/withRedisFailOpen.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getTrackBodyIdempotencyKey } from "@/internal/balances/idempotency/trackBodyIdempotencyKey.js";
import { isFullSubjectGateRejection } from "@/internal/customers/repos/getFullSubject/getFullSubjectGate.js";
import { withIdempotencyKey } from "@/internal/misc/idempotency/withIdempotencyKey.js";
import { isFullSubjectRolloutEnabled } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import type { FeatureDeduction } from "../utils/types/featureDeduction.js";
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
	// The body key is claimed at accept time and KEPT — even when the track is
	// queued for replay, the claim already happened, so the worker skips it
	// (queueTrack marks the message validateTrackBodyIdempotencyKey: false).
	return withIdempotencyKey({
		ctx,
		idempotencyKey: getTrackBodyIdempotencyKey({ body }),
		run: async () => {
			if (ctx.orgRateLimitDegraded) {
				const queuedResponse = await queueTrack({ ctx, body });
				if (queuedResponse) return queuedResponse;
			}

			return withRedisFailOpen<TrackResponseV3>({
				source: "runTrackWithRollout",
				run: () =>
					runTrackV3({
						ctx,
						body,
						featureDeductions,
						apiVersion,
					}),
				alsoFailOpen: isFullSubjectGateRejection,
				fallback: async (error) => {
					const queuedResponse = await queueTrack({ ctx, body });
					if (queuedResponse) return queuedResponse;
					throw error;
				},
			});
		},
	});
};
