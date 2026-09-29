import {
	AffectedResource,
	RouteGroup,
	Scopes,
	TrackTokensParamsSchema,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { trackOnBalanceWorker } from "@/internal/balances/track/balanceWorker/trackOnBalanceWorker.js";
import { runAsyncTrack } from "@/internal/balances/track/runAsyncTrack.js";
import { runTrackWithRollout } from "@/internal/balances/track/runTrackWithRollout.js";
import { getQueuedTrackResponse } from "@/internal/balances/track/utils/getQueuedTrackResponse.js";
import { getTokenTrackParams } from "@/internal/balances/track/utils/getTokenTrackParams.js";
import { isBalanceWorkerRolloutEnabled } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";

export const handleTrackTokens = createRoute({
	scopes: [Scopes.Balances.Write],
	routeGroup: RouteGroup.Balances,
	body: TrackTokensParamsSchema,
	resource: AffectedResource.Track,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		const { body: trackBody, featureDeductions } = await getTokenTrackParams({
			ctx,
			input: body,
		});

		if (
			isBalanceWorkerRolloutEnabled({ ctx, customerId: trackBody.customer_id })
		) {
			const { result, status } = await trackOnBalanceWorker({
				ctx,
				body: trackBody,
				isAsync: trackBody.async === true,
			});
			return c.json(result, status);
		}

		if (trackBody.async === true) {
			await runAsyncTrack({ ctx, body: trackBody });
			return c.json(getQueuedTrackResponse({ ctx, body: trackBody }), 202);
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
