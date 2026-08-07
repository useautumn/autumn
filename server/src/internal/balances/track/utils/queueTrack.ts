import type { TrackParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { getAsyncTrackProducerQueueUrl } from "@/queue/trackAsyncQueueUrls.js";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs.js";
import { getQueuedTrackResponse } from "./getQueuedTrackResponse.js";

type QueueTrackOptions = {
	queueUrl?: string;
	messageGroupId?: string;
	messageDeduplicationId?: string;
	/** Per-item override (batch) — seeds the worker ctx.id and therefore the
	 *  queue replay dedup keys. Defaults to the request's ctx.id. */
	requestId?: string;
	/** True when the enqueuer did NOT claim the body idempotency key at accept
	 *  time (batch) — the worker claims it instead. */
	validateTrackBodyIdempotencyKey?: boolean;
	logFallback?: boolean;
	markQueuedForReplay?: boolean;
};

export const queueTrack = async ({
	ctx,
	body,
	options = {},
}: {
	ctx: AutumnContext;
	body: TrackParams;
	options?: QueueTrackOptions;
}) => {
	const {
		queueUrl,
		messageGroupId,
		messageDeduplicationId,
		requestId,
		validateTrackBodyIdempotencyKey = false,
		logFallback = true,
		markQueuedForReplay = true,
	} = options;

	try {
		// Prefer the Standard async queue while keeping the legacy FIFO as a
		// rollout fallback. TRACK_SQS_QUEUE_URL is the final deprecated fallback.
		const resolvedQueueUrl =
			queueUrl ??
			getAsyncTrackProducerQueueUrl() ??
			process.env.TRACK_SQS_QUEUE_URL;
		if (!resolvedQueueUrl) {
			ctx.logger.warn(
				"[track] async Track queue URLs are unset; falling back to synchronous track",
			);
			return null;
		}

		await addTaskToQueue({
			jobName: JobName.Track,
			queueUrl: resolvedQueueUrl,
			messageGroupId:
				messageGroupId ??
				`${ctx.org.id}:${ctx.env}:${body.customer_id}:${body.entity_id ?? "none"}`,
			messageDeduplicationId: messageDeduplicationId ?? ctx.id,
			payload: {
				orgId: ctx.org.id,
				env: ctx.env,
				customerId: body.customer_id,
				entityId: body.entity_id,
				requestId: requestId ?? ctx.id,
				apiVersion: ctx.apiVersion.value,
				body,
				// Sync/async paths claim the key at accept (default false) — only
				// batch items ask the worker to claim.
				validateTrackBodyIdempotencyKey,
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
		// A raw Error logs as {} (message/stack are non-enumerable) — flatten it.
		ctx.logger.warn("[track] Queue fallback failed (SQS)", {
			type: "track_queue_fallback_failed",
			error: error instanceof Error ? error.message : String(error),
			errorName: error instanceof Error ? error.name : undefined,
		});

		return null;
	}
};
