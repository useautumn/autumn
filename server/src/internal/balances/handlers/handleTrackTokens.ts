import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { runTrackV2 } from "@/internal/balances/track/runTrackV2.js";
import { getTokenTrackParams } from "@/internal/balances/track/utils/getTokenTrackParams.js";
import { AffectedResource, Scopes, TrackTokensParamsSchema } from "@autumn/shared";

export const handleTrackTokens = createRoute({
	scopes: [Scopes.Balances.Write],
	body: TrackTokensParamsSchema,
	resource: AffectedResource.Track,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		const { body: trackBody, featureDeductions } = await getTokenTrackParams({
			ctx,
			input: body,
		});

		return c.json(
			await runTrackV2({
				ctx,
				body: trackBody,
				featureDeductions,
			}),
		);
	},
});
