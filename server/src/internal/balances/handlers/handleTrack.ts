import {
	AffectedResource,
	ApiVersion,
	TrackParamsSchema,
	TrackQuerySchema,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { runTrackWithRollout } from "@/internal/balances/track/runTrackWithRollout.js";
import { getTrackFeatureDeductionsForBody } from "@/internal/balances/track/utils/getFeatureDeductions.js";

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

		return c.json(
			await runTrackWithRollout({
				ctx,
				body,
				featureDeductions,
			}),
		);
	},
});
