import {
	AffectedResource,
	ApiVersion,
	TrackParamsSchema,
	TrackParamsV0Schema,
	TrackQuerySchema,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { runTrackV2 } from "@/internal/balances/track/runTrackV2.js";
import {
	getTrackEventNameDeductions,
	getTrackFeatureDeductions,
} from "@/internal/balances/track/utils/getFeatureDeductions.js";

export const handleTrack = createRoute({
	query: TrackQuerySchema,
	versionedBody: {
		latest: TrackParamsSchema,
		[ApiVersion.V1_Beta]: TrackParamsV0Schema,
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
					value: body.value,
				})
			: getTrackEventNameDeductions({
					ctx,
					eventName: body.event_name!,
					value: body.value,
				});

		return c.json(
			await runTrackV2({
				ctx,
				body,
				featureDeductions,
			}),
		);
	},
});
