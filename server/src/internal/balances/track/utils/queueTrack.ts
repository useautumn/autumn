import type { TrackParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { TokenDeduction } from "@/internal/balances/utils/types/featureDeduction.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { getAsyncTrackProducerQueueUrl } from "@/queue/trackAsyncQueueUrls.js";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs.js";
import { getQueuedTrackResponse } from "./getQueuedTrackResponse.js";

type QueueTrackOptions = {
	queueUrl?: string;
	messageGroupId?: string;
	messageDeduplicationId?: string;
	requestId?: string;
	validateTrackBodyIdempotencyKey?: boolean;
	logFallback?: boolean;
	markQueuedForReplay?: boolean;
};

export const queueTrack = async ({
	ctx,
	body,
	tokens,
	options = {},
}: {
	ctx: AutumnContext;
	body: TrackParams;
	tokens?: TokenDeduction;
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
				tokens,
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
		ctx.logger.warn("[track] Queue fallback failed (SQS)", {
			type: "track_queue_fallback_failed",
			error: error instanceof Error ? error.message : String(error),
			errorName: error instanceof Error ? error.name : undefined,
		});

		return null;
	}
};
