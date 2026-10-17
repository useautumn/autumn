import { createHash } from "node:crypto";
import type { FinalizeLockParamsV1 } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs.js";

export const getFinalizeLockMessageGroupId = ({
	orgId,
	env,
	lockId,
}: {
	orgId: string;
	env: string;
	lockId: string;
}) =>
	`finalize:${createHash("sha256")
		.update(`${orgId}:${env}:lock:${lockId}`)
		.digest("hex")}`;

/** Queues a finalize-lock replay on the track queue when Redis is down.
 *  Returns the accepted response, or null when queueing is unavailable. */
export const queueFinalizeLock = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: FinalizeLockParamsV1;
}) => {
	try {
		const queueUrl = process.env.TRACK_SQS_QUEUE_URL;
		if (!queueUrl) {
			ctx.logger.warn(
				"[finalizeLock] Redis unavailable and TRACK_SQS_QUEUE_URL is unset; cannot queue finalize replay",
			);
			return null;
		}

		await addTaskToQueue({
			jobName: JobName.FinalizeLock,
			queueUrl,
			messageGroupId: getFinalizeLockMessageGroupId({
				orgId: ctx.org.id,
				env: ctx.env,
				lockId: params.lock_id,
			}),
			messageDeduplicationId: ctx.id,
			payload: {
				orgId: ctx.org.id,
				env: ctx.env,
				customerId: ctx.customerId,
				requestId: ctx.id,
				params,
			},
		});

		ctx.logger.warn(
			"[finalizeLock] Redis unavailable, queued finalize replay",
			{
				type: "finalize_lock_queue_fallback",
				lock_id: params.lock_id,
				action: params.action,
			},
		);
		addToExtraLogs({
			ctx,
			extras: { finalizeLockQueuedForReplay: true },
		});

		return { success: true };
	} catch (error) {
		ctx.logger.warn("[finalizeLock] Queue fallback failed (SQS)", {
			type: "finalize_lock_queue_fallback_failed",
			error,
		});

		return null;
	}
};
