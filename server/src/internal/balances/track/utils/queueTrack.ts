import type { TrackParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { getQueuedTrackResponse } from "./getQueuedTrackResponse.js";

export const queueTrack = async ({
	ctx,
	body,
}: {
	ctx: AutumnContext;
	body: TrackParams;
}) => {
	const queueUrl = process.env.TRACK_SQS_QUEUE_URL;
	if (!queueUrl) {
		ctx.logger.warn(
			"[track] Redis unavailable and TRACK_SQS_QUEUE_URL is unset; falling back to synchronous track",
		);
		return null;
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

	return getQueuedTrackResponse({
		ctx,
		body,
	});
};
