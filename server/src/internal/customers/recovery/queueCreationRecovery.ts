import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { JobName } from "@/queue/JobName.js";
import { addTaskToQueue, type Payloads } from "@/queue/queueUtils.js";

/** One group for every creation replay: a hard concurrency ceiling of one, in failure order. */
export const CUSTOMER_CREATION_RECOVERY_MESSAGE_GROUP_ID =
	"customer-creation-recovery";

type CreationRecoveryJobName =
	| JobName.CustomerCreationRecovery
	| JobName.EntityCreationRecovery;

/** False, never a throw, when the queue is missing or unreachable: the request's own failure is the answer. */
export const queueCreationRecovery = async <T extends CreationRecoveryJobName>({
	ctx,
	jobName,
	messageDeduplicationId,
	payload,
}: {
	ctx: AutumnContext;
	jobName: T;
	messageDeduplicationId: string;
	payload: Payloads[T];
}): Promise<{ queued: true; queueUrl: string } | { queued: false }> => {
	const queueUrl = process.env.CUSTOMER_CREATION_RECOVERY_SQS_QUEUE_URL;
	if (!queueUrl) {
		ctx.logger.error(`[${jobName}] Recovery queue URL is not configured`);
		return { queued: false };
	}

	try {
		await addTaskToQueue({
			jobName,
			queueUrl,
			messageGroupId: CUSTOMER_CREATION_RECOVERY_MESSAGE_GROUP_ID,
			messageDeduplicationId,
			generateDeduplicationId: false,
			payload,
		});
		return { queued: true, queueUrl };
	} catch (error) {
		ctx.logger.error(`[${jobName}] Failed to enqueue creation recovery`, {
			error,
		});
		return { queued: false };
	}
};
