import {
	AffectedResource,
	ApiVersion,
	ErrCode,
	RecaseError,
	Scopes,
	TrackParamsSchema,
	TrackQuerySchema,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { runTrackWithRollout } from "@/internal/balances/track/runTrackWithRollout.js";
import { getTrackFeatureDeductionsForBody } from "@/internal/balances/track/utils/getFeatureDeductions.js";
import { queueTrack } from "@/internal/balances/track/utils/queueTrack.js";

export const handleTrack = createRoute({
	scopes: [Scopes.Balances.Write],
	query: TrackQuerySchema,
	versionedBody: {
		latest: TrackParamsSchema,
		[ApiVersion.V1_Beta]: TrackParamsSchema,
	},
	resource: AffectedResource.Track,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");
		const featureDeductions = getTrackFeatureDeductionsForBody({ ctx, body });

		if (body.async === true) {
			const queueUrl = process.env.TRACK_ASYNC_SQS_QUEUE_URL;
			if (!queueUrl) {
				throw new RecaseError({
					message:
						"Async track requested but TRACK_ASYNC_SQS_QUEUE_URL is unset",
					code: ErrCode.InternalError,
					statusCode: 503,
				});
			}
			const queued = await queueTrack({ ctx, body, queueUrl });
			if (!queued) {
				throw new RecaseError({
					message: "Failed to enqueue async track",
					code: ErrCode.InternalError,
					statusCode: 503,
				});
			}
			return c.json({ success: true }, 202);
		}

		const response = await runTrackWithRollout({
			ctx,
			body,
			featureDeductions,
		});
		const status = ctx.extraLogs.trackQueuedForReplay ? 202 : 200;

		return c.json(response, status);
	},
});
