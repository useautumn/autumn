import {
	AffectedResource,
	ApiVersion,
	TrackParamsSchema,
	TrackQuerySchema,
} from "@autumn/shared";
import { shouldUseRedis } from "@/external/redis/initRedis.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { runTrackV2 } from "@/internal/balances/track/runTrackV2.js";
import { getTrackFeatureDeductionsForBody } from "@/internal/balances/track/utils/getFeatureDeductions.js";
import { queueTrack } from "@/internal/balances/track/utils/queueTrack.js";

export const handleTrack = createRoute({
	query: TrackQuerySchema,
	versionedBody: {
		latest: TrackParamsSchema,
		[ApiVersion.V1_Beta]: TrackParamsSchema,
	},
	resource: AffectedResource.Track,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");
		const featureDeductions = getTrackFeatureDeductionsForBody({ ctx, body });

		if (!shouldUseRedis()) {
			const queuedResponse = await queueTrack({
				ctx,
				body,
			});
			if (queuedResponse) {
				return c.json(queuedResponse);
			}
		}

		return c.json(await runTrackV2({ ctx, body, featureDeductions }));
	},
});
