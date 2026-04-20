import {
	AffectedResource,
	ApiVersion,
	TrackParamsSchema,
	TrackQuerySchema,
} from "@autumn/shared";
import { shouldUseRedis } from "@/external/redis/initRedis.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { runTrackV2 } from "@/internal/balances/track/runTrackV2.js";
import { getTrackFeatureDeductionsForBody } from "@/internal/balances/track/utils/getFeatureDeductions.js";
import { getQueuedTrackResponse } from "@/internal/balances/track/utils/getQueuedTrackResponse.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";

export const handleTrack = createRoute({
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

		if (!shouldUseRedis()) {
			const queueUrl = process.env.TRACK_SQS_QUEUE_URL;
			if (!queueUrl) {
				throw new Error("TRACK_SQS_QUEUE_URL is not configured");
			}

			await addTaskToQueue({
				jobName: JobName.Track,
				queueUrl,
				messageGroupId: `${ctx.org.id}:${ctx.env}:${body.customer_id}`,
				messageDeduplicationId: body.idempotency_key,
				payload: {
					orgId: ctx.org.id,
					env: ctx.env,
					apiVersion: ctx.apiVersion.value,
					body,
				},
			});

			return c.json(
				getQueuedTrackResponse({
					ctx,
					body,
				}),
			);
		}

		return c.json(await runTrackV2({ ctx, body, featureDeductions }));
	},
});
