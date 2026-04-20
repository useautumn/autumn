import {
	AffectedResource,
	ApiVersion,
	TrackParamsSchema,
	TrackQuerySchema,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { runTrackWithRollout } from "@/internal/balances/track/runTrackWithRollout.js";
import {
	getTrackEventNameDeductions,
	getTrackFeatureDeductions,
} from "@/internal/balances/track/utils/getFeatureDeductions.js";

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

		// Build feature deductions
		const featureDeductions = body.feature_id
			? getTrackFeatureDeductions({
					ctx,
					featureId: body.feature_id,
					lock: body.lock,
					value: body.value,
				})
			: getTrackEventNameDeductions({
					ctx,
					eventName: body.event_name!,
					value: body.value,
				});

		return c.json(
			await runTrackWithRollout({
				ctx,
				body,
				featureDeductions,
			}),
		);
	},
});
