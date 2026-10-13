import {
	AffectedResource,
	ApiVersion,
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
import { isQueuedTokenTrack } from "@/internal/balances/track/utils/isQueuedTrack.js";
import { findTokenDeduction } from "@/internal/balances/track/utils/tokenFeatureDeduction.js";
import { isBalanceWorkerRolloutEnabled } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";

export const handleTrackTokens = createRoute({
	scopes: [Scopes.Balances.Write],
	routeGroup: RouteGroup.Balances,
	versionedBody: {
		latest: TrackTokensParamsSchema,
		[ApiVersion.V2_4]: TrackTokensParamsSchema,
	},
	resource: AffectedResource.TrackTokens,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		const { body: trackBody, featureDeductions } = await getTokenTrackParams({
			ctx,
			input: body,
		});
		const isAsync = isQueuedTokenTrack({ body: trackBody });

		if (
			isBalanceWorkerRolloutEnabled({ ctx, customerId: trackBody.customer_id })
		) {
			const { result, status } = await trackOnBalanceWorker({
				ctx,
				body: trackBody,
				isAsync,
				recordsCreditCost: true,
			});
			return c.json(result, status);
		}

		if (isAsync) {
			await runAsyncTrack({
				ctx,
				body: trackBody,
				tokens: findTokenDeduction({ featureDeductions }),
			});
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
