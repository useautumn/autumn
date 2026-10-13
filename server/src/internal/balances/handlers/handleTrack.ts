import {
	AffectedResource,
	ApiVersion,
	RouteGroup,
	Scopes,
	type TrackParams,
	TrackParamsSchema,
	TrackQuerySchema,
} from "@autumn/shared";
import { trace } from "@opentelemetry/api";
import type { Context } from "hono";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
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
	const span = trace.getActiveSpan();
	span?.setAttributes({
		"track.feature_id": body.feature_id,
		"track.event_name": body.event_name,
		"track.idempotency_key": body.idempotency_key,
		"track.value": body.value ?? 1,
	});

	const isAsync = isQueuedTrack({ ctx, body });

	const featureDeductions = getValidatedTrackFeatureDeductions({ ctx, body });

	if (isBalanceWorkerRolloutEnabled({ ctx, customerId: body.customer_id })) {
		const { result, status } = await trackOnBalanceWorker({
			ctx,
			body,
			isAsync,
		});
		span?.setAttribute("track.queued", status === 202);
		return c.json(result, status);
	}

	if (isAsync) {
		await runAsyncTrack({ ctx, body });
		span?.setAttribute("track.queued", true);
		return c.json(getQueuedTrackResponse({ ctx, body }), 202);
	}

	const response = await runTrackWithRollout({ ctx, body, featureDeductions });
	const status = ctx.extraLogs.trackQueuedForReplay ? 202 : 200;
	span?.setAttribute("track.queued", status === 202);
	return c.json(response, status);
}
