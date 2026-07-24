import type { Logger } from "@/external/logtail/logtailUtils.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import type { BatchResetCustomerEntitlementsV2Payload } from "./types.js";

/**
 * Enqueues a batch reset onto its dedicated SQS queue
 * (BATCH_RESET_SQS_QUEUE_URL). Falls back to the primary queue when unset so
 * dev environments without the queue still process resets.
 */
export const enqueueBatchResetTask = async ({
	payload,
	logger,
}: {
	payload: BatchResetCustomerEntitlementsV2Payload;
	logger: Logger;
}) => {
	const queueUrl = process.env.BATCH_RESET_SQS_QUEUE_URL;
	if (!queueUrl) {
		logger.warn(
			"[batchReset] BATCH_RESET_SQS_QUEUE_URL unset, falling back to primary queue",
		);
	}

	await addTaskToQueue({
		jobName: JobName.BatchResetCustomerEntitlementsV2,
		payload,
		queueUrl,
	});
};
