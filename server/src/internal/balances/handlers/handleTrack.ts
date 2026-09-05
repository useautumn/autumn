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
import { runBalanceWorkerTrack } from "@/internal/balances/track/balanceWorker/runBalanceWorkerTrack.js";
import { runAsyncTrack } from "@/internal/balances/track/runAsyncTrack.js";
import { runTrackWithRollout } from "@/internal/balances/track/runTrackWithRollout.js";
import { getTrackFeatureDeductionsForBody } from "@/internal/balances/track/utils/getFeatureDeductions.js";
import { getQueuedTrackResponse } from "@/internal/balances/track/utils/getQueuedTrackResponse.js";
import { isAsyncTrackEnabled } from "@/internal/misc/asyncTrack/asyncTrackStore.js";
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

	if (isBalanceWorkerRolloutEnabled({ ctx })) {
		return c.json(await runBalanceWorkerTrack({ ctx, body }));
	}

	const featureDeductions = getTrackFeatureDeductionsForBody({ ctx, body });

	if (
		body.async === true ||
		isAsyncTrackEnabled({ orgId: ctx.org.id, orgSlug: ctx.org.slug })
	) {
		await runAsyncTrack({ ctx, body });
		return c.json(getQueuedTrackResponse({ ctx, body }), 202);
	}

	const response = await runTrackWithRollout({ ctx, body, featureDeductions });
	const status = ctx.extraLogs.trackQueuedForReplay ? 202 : 200;
	return c.json(response, status);
}
