import { JOB_QUEUE_IDS } from "@/internal/misc/edgeConfigs/jobQueues/jobQueueStore.js";
import { getResetJobV2Config } from "@/internal/misc/edgeConfigs/resetJobV2/resetJobV2Store.js";

export type QueueConcurrencyPolicy = {
	redisKey: string;
	maxConcurrentMessages: number;
	leaseMs: number;
};

export const getQueueConcurrencyPolicy = ({
	queueId,
}: {
	queueId: string;
}): QueueConcurrencyPolicy | null => {
	switch (queueId) {
		case JOB_QUEUE_IDS.batchReset:
			return {
				redisKey: "queue:batch-reset-v2:active-jobs",
				maxConcurrentMessages: getResetJobV2Config().maxConcurrentJobs,
				leaseMs: 90_000,
			};
		default:
			return null;
	}
};
