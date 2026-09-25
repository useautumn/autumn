import { CreateQueueCommand, SQSClient } from "@aws-sdk/client-sqs";
import { ELASTICMQ_BASE_URL } from "../constants.js";

// Test infrastructure only: provision inside each TW worker, never in production.
const QUEUE_NAME = "autumn-balance-sync.fifo";
export const BALANCE_SYNC_SQS_QUEUE_URL = `${ELASTICMQ_BASE_URL}/${QUEUE_NAME}`;

export const prepareBalanceSyncQueue = async (): Promise<void> => {
	const sqs = new SQSClient({
		endpoint: new URL(ELASTICMQ_BASE_URL).origin,
		region: "us-east-1",
		credentials: { accessKeyId: "local", secretAccessKey: "local" },
		maxAttempts: 1,
	});
	try {
		// Provision at startup so older warm snapshots work without rebuilding their image.
		await sqs.send(
			new CreateQueueCommand({
				QueueName: QUEUE_NAME,
				Attributes: { FifoQueue: "true", ContentBasedDeduplication: "false" },
			}),
			{ abortSignal: AbortSignal.timeout(5_000) },
		);
	} finally {
		sqs.destroy();
	}
};

if (import.meta.main) await prepareBalanceSyncQueue();
