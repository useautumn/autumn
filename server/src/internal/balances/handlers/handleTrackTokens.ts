import {
	AffectedResource,
	Scopes,
	TrackTokensParamsSchema,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { runAsyncTrack } from "@/internal/balances/track/runAsyncTrack.js";
import { runTrackWithRollout } from "@/internal/balances/track/runTrackWithRollout.js";
import { getTokenTrackParams } from "@/internal/balances/track/utils/getTokenTrackParams.js";

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

		if (trackBody.async === true) {
			await runAsyncTrack({ ctx, body: trackBody });
			return c.json({ success: true }, 202);
		}

		const response = await runTrackWithRollout({
			ctx,
			body: trackBody,
			featureDeductions,
		});
		const status = ctx.extraLogs.trackQueuedForReplay ? 202 : 200;

		return c.json(response, status);
	},
});
