import { TrackParamsSchema, TrackQuerySchema } from "@autumn/shared";
import { createRoute } from "../../../honoMiddlewares/routeHandler.js";
import { runTrackV2 } from "../track/runTrackV2.js";
import {
	getTrackEventNameDeductions,
	getTrackFeatureDeductions,
} from "../track/trackUtils/getFeatureDeductions.js";

export const handleTrack = createRoute({
	query: TrackQuerySchema,
	body: TrackParamsSchema,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		// Legacy: support value in properties
		if (body.properties?.value) {
			const parsedValue = Number(body.properties.value);
			if (!Number.isNaN(parsedValue)) {
				body.value = parsedValue;
			}
		}

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
