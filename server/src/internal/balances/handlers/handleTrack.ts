import {
	AffectedResource,
	ApiVersion,
	RouteGroup,
	Scopes,
	type TrackParams,
	TrackParamsSchema,
	TrackQuerySchema,
} from "@autumn/shared";
import type { Context } from "hono";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import {
	isAllowedAnswer,
	trackToAtomCheckParams,
} from "@/internal/balances/atomShadowDeduct/atomShadowDeductGuards.js";
import { withAtomShadowDeduction } from "@/internal/balances/atomShadowDeduct/withAtomShadowDeduction.js";
import { trackOnBalanceWorker } from "@/internal/balances/track/balanceWorker/trackOnBalanceWorker.js";
import { runAsyncTrack } from "@/internal/balances/track/runAsyncTrack.js";
import { runTrackWithRollout } from "@/internal/balances/track/runTrackWithRollout.js";
import { getQueuedTrackResponse } from "@/internal/balances/track/utils/getQueuedTrackResponse.js";
import { getValidatedTrackFeatureDeductions } from "@/internal/balances/track/utils/getValidatedTrackFeatureDeductions.js";
import { isQueuedTrack } from "@/internal/balances/track/utils/isQueuedTrack.js";
import { isBalanceWorkerRolloutEnabled } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";

export const handleTrack = createRoute({
	scopes: [Scopes.Balances.Write],
	routeGroup: RouteGroup.Balances,
	query: TrackQuerySchema,
	versionedBody: {
		latest: TrackParamsSchema,
		[ApiVersion.V1_Beta]: TrackParamsSchema,
	},
	resource: AffectedResource.Track,
	handler: track,
});

async function track(
	c: Context<HonoEnv, string, { out: { json: TrackParams } }>,
) {
	const body = c.req.valid("json");
	const ctx = c.get("ctx");

	const isAsync = isQueuedTrack({ ctx, body });

	const featureDeductions = getValidatedTrackFeatureDeductions({ ctx, body });

	if (isBalanceWorkerRolloutEnabled({ ctx, customerId: body.customer_id })) {
		const response = await withAtomShadowDeduction({
			ctx,
			route: "track",
			atomParams: isAsync ? trackToAtomCheckParams({ body }) : null,
			idempotencyKey: body.idempotency_key,
			// A denied check deducted nothing, so the track's own overage rules apply on the API.
			answerOf: ({ status, body: answer }) =>
				status === 200 && isAllowedAnswer({ body: answer })
					? { body: getQueuedTrackResponse({ ctx, body }), status: 202 }
					: null,
			runOnApi: async ({ idempotencyKey }) => {
				const { result, status } = await trackOnBalanceWorker({
					ctx,
					body: { ...body, idempotency_key: idempotencyKey },
					isAsync,
				});
				return { body: result, status };
			},
		});
		return c.json(response.body, response.status);
	}

	if (isAsync) {
		await runAsyncTrack({ ctx, body });
		return c.json(getQueuedTrackResponse({ ctx, body }), 202);
	}

	const response = await runTrackWithRollout({ ctx, body, featureDeductions });
	const status = ctx.extraLogs.trackQueuedForReplay ? 202 : 200;
	return c.json(response, status);
}
