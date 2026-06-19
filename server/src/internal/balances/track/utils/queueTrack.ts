import type { TrackParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs.js";
import { getQueuedTrackResponse } from "./getQueuedTrackResponse.js";

export const queueTrack = async ({
	ctx,
	body,
	queueUrl,
	messageDeduplicationId,
	logFallback = true,
	markQueuedForReplay = true,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	queueUrl?: string;
	messageDeduplicationId?: string;
	logFallback?: boolean;
	markQueuedForReplay?: boolean;
}) => {
	try {
		const resolvedQueueUrl = queueUrl ?? process.env.TRACK_SQS_QUEUE_URL;
		if (!resolvedQueueUrl) {
			ctx.logger.warn(
				"[track] Redis unavailable and TRACK_SQS_QUEUE_URL is unset; falling back to synchronous track",
			);
			return null;
		}

		await addTaskToQueue({
			jobName: JobName.Track,
			queueUrl: resolvedQueueUrl,
			messageGroupId: `${ctx.org.id}:${ctx.env}:${body.customer_id}:${body.entity_id ?? "none"}`,
			messageDeduplicationId: messageDeduplicationId ?? ctx.id,
			payload: {
				orgId: ctx.org.id,
				env: ctx.env,
				customerId: body.customer_id,
				entityId: body.entity_id,
				requestId: ctx.id,
				apiVersion: ctx.apiVersion.value,
				body,
			},
		});

		if (logFallback) {
			ctx.logger.warn("[track] Redis unavailable, queued track fallback", {
				type: "track_queue_fallback",
				feature_id: body.feature_id,
				event_name: body.event_name,
				env: ctx.env,
				queue_name: resolvedQueueUrl.split("/").pop(),
			});
		}
		if (markQueuedForReplay) {
			addToExtraLogs({
				ctx,
				extras: {
					trackQueuedForReplay: true,
				},
			});
		}

		return getQueuedTrackResponse({
			ctx,
			body,
		});
	} catch (error) {
		ctx.logger.warn("[track] Queue fallback failed (SQS)", {
			type: "track_queue_fallback_failed",
			error,
		});

		return null;
	}
};
