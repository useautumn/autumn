import { type BatchTrackParams, ErrCode, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { JobName } from "@/queue/JobName.js";
import { addTasksToQueueBatch } from "@/queue/queueUtils.js";
import { getAsyncTrackMessageGroupId } from "./utils/getAsyncTrackMessageGroupId.js";
import { getTrackFeatureDeductionsForBody } from "./utils/getFeatureDeductions.js";

const ASYNC_TRACK_UNAVAILABLE_MESSAGE =
	"Async track is not available right now";
const LOGGED_FAILURE_LIMIT = 25;

export const runBatchTrack = async ({
	ctx,
	body,
}: {
	ctx: AutumnContext;
	body: BatchTrackParams;
}): Promise<void> => {
	const queueUrl = process.env.TRACK_ASYNC_SQS_QUEUE_URL;
	if (!queueUrl) {
		ctx.logger.error(
			"[track] batch track requested but TRACK_ASYNC_SQS_QUEUE_URL is unset",
		);
		throw new RecaseError({
			message: ASYNC_TRACK_UNAVAILABLE_MESSAGE,
			code: ErrCode.InternalError,
			statusCode: 503,
		});
	}

	for (const item of body) {
		getTrackFeatureDeductionsForBody({ ctx, body: item });
	}

	const entries = body.map((item, index) => {
		const messageDeduplicationId = `${ctx.id}-${index}`;

		return {
			payload: {
				orgId: ctx.org.id,
				env: ctx.env,
				customerId: item.customer_id,
				entityId: item.entity_id,
				requestId: ctx.id,
				apiVersion: ctx.apiVersion.value,
				body: item,
			},
			messageGroupId: getAsyncTrackMessageGroupId({
				orgId: ctx.org.id,
				env: ctx.env,
				customerId: item.customer_id,
				entityId: item.entity_id,
				messageDeduplicationId,
			}),
			messageDeduplicationId,
		};
	});

	const { successCount, failures } = await addTasksToQueueBatch({
		jobName: JobName.Track,
		queueUrl,
		entries,
	});

	if (failures.length > 0) {
		const isTotalFailure = successCount === 0;
		ctx.logger.error(
			isTotalFailure
				? "[track] batch track enqueue failed"
				: "[track] batch track enqueue had partial failures",
			{
				type: isTotalFailure
					? "batch_track_enqueue_failure"
					: "batch_track_enqueue_partial_failure",
				success_count: successCount,
				failure_count: failures.length,
				total_count: entries.length,
				failures: failures.slice(0, LOGGED_FAILURE_LIMIT),
				omitted_failure_count: Math.max(
					failures.length - LOGGED_FAILURE_LIMIT,
					0,
				),
				queue_name: queueUrl.split("/").pop(),
			},
		);

		if (isTotalFailure) {
			throw new RecaseError({
				message: ASYNC_TRACK_UNAVAILABLE_MESSAGE,
				code: ErrCode.InternalError,
				statusCode: 503,
			});
		}
	}
};
