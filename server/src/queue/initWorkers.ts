import {
  DeleteMessageCommand,
  type Message,
  ReceiveMessageCommand,
} from "@aws-sdk/client-sqs";
import type { Logger } from "pino";
import { type DrizzleCli, initDrizzle } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { runActionHandlerTask } from "@/internal/analytics/runActionHandlerTask.js";
import { runInsertEventBatch } from "@/internal/balances/track/eventUtils/runInsertEventBatch.js";
import { runSyncBalanceBatch } from "@/internal/balances/track/syncUtils/runSyncBalanceBatch.js";
import { runSaveFeatureDisplayTask } from "@/internal/features/featureUtils.js";
import { runMigrationTask } from "@/internal/migrations/runMigrationTask.js";
import { runRewardMigrationTask } from "@/internal/migrations/runRewardMigrationTask.js";
import { detectBaseVariant } from "@/internal/products/productUtils/detectProductVariant.js";
import { runTriggerCheckoutReward } from "@/internal/rewards/triggerCheckoutReward.js";
import { generateId } from "@/utils/genUtils.js";
import { QUEUE_URL, sqs } from "./initSqs.js";
import { JobName } from "./JobName.js";

// Number of concurrent polling loops
const NUM_WORKERS = process.env.SQS_WORKERS
	? Number.parseInt(process.env.SQS_WORKERS)
	: 10;

const actionHandlers = [
	JobName.HandleProductsUpdated,
	JobName.HandleCustomerCreated,
];

interface SqsJob {
	name: string;
	data: any;
}

/**
 * Process a single SQS message
 */
const processMessage = async ({
	message,
	db,
	workerId,
}: {
	message: Message;
	db: DrizzleCli;
	workerId: number;
}) => {
	if (!message.Body) {
		console.warn("Received message without body");
		return;
	}

	const job: SqsJob = JSON.parse(message.Body);

	const workerLogger = logger.child({
		context: {
			worker: {
				task: job.name,
				data: job.data,
				jobId: generateId("job"),
				workerId,
				messageId: message.MessageId,
			},
		},
	});

	try {
		if (job.name === JobName.DetectBaseVariant) {
			await detectBaseVariant({
				db,
				curProduct: job.data.curProduct,
				logger: workerLogger as Logger,
			});
			return;
		}

		if (job.name === JobName.GenerateFeatureDisplay) {
			await runSaveFeatureDisplayTask({
				db,
				feature: job.data.feature,
				logger: workerLogger,
			});
			return;
		}

		if (job.name === JobName.Migration) {
			await runMigrationTask({
				db,
				payload: job.data,
				logger: workerLogger,
			});
			return;
		}

		if (actionHandlers.includes(job.name as JobName)) {
			// Note: action handlers need BullMQ queue for nested jobs
			// This will need to be refactored when migrating action handlers to SQS
			await runActionHandlerTask({
				queue: null as any,
				job: { name: job.name, data: job.data } as any,
				logger: workerLogger,
				db,
			});
			return;
		}

		if (job.name === JobName.RewardMigration) {
			await runRewardMigrationTask({
				db,
				payload: job.data,
				logger: workerLogger,
			});
			return;
		}

		if (job.name === JobName.SyncBalanceBatch) {
			await runSyncBalanceBatch({
				db,
				payload: job.data,
				logger: workerLogger as Logger,
			});
			return;
		}

		if (job.name === JobName.InsertEventBatch) {
			await runInsertEventBatch({
				db,
				payload: job.data,
				logger: workerLogger as Logger,
			});
			return;
		}

		if (job.name === JobName.TriggerCheckoutReward) {
			await runTriggerCheckoutReward({
				db,
				payload: job.data,
				logger: workerLogger,
			});
		}
	} catch (error: any) {
		workerLogger.error(`Failed to process SQS job: ${job.name}`, {
			jobName: job.name,
			error: {
				message: error.message,
				stack: error.stack,
			},
		});
		// Don't delete the message on error - it will become visible again for retry
		throw error;
	}
};

let isRunning = true;
const isFifoQueue = QUEUE_URL.endsWith(".fifo");
const abortControllers: AbortController[] = [];

/**
 * Single worker polling loop - runs continuously until shutdown
 */
const startPollingLoop = async ({
	workerId,
	db,
}: {
	workerId: number;
	db: DrizzleCli;
}) => {
	console.log(`[Worker ${workerId}] Started`);
	const abortController = new AbortController();
	abortControllers.push(abortController);

	while (isRunning) {
		try {
			const command = new ReceiveMessageCommand({
				QueueUrl: QUEUE_URL,
				MaxNumberOfMessages: 1, // Process one message at a time
				WaitTimeSeconds: 20, // Long polling
				VisibilityTimeout: 60, // 60 seconds to process the message
				// For FIFO queues, add ReceiveRequestAttemptId for deduplication
				...(isFifoQueue && {
					ReceiveRequestAttemptId: generateId("receive"),
				}),
			});

			const response = await sqs.send(command, {
				abortSignal: abortController.signal,
			});

			if (response.Messages && response.Messages.length > 0) {
				for (const message of response.Messages) {
					// Check if we should stop before processing
					if (!isRunning) {
						console.log(`[Worker ${workerId}] Stopping, skipping message processing`);
						break;
					}

					try {
						await processMessage({ message, db, workerId });

						// Delete message after successful processing
						if (message.ReceiptHandle) {
							await sqs.send(
								new DeleteMessageCommand({
									QueueUrl: QUEUE_URL,
									ReceiptHandle: message.ReceiptHandle,
								}),
							);
							console.log(
								`[Worker ${workerId}] Processed message ${message.MessageId}`,
							);
						}
					} catch (error: any) {
						console.error(
							`[Worker ${workerId}] Failed to process message ${message.MessageId}:`,
							error.message,
						);
						// Message will automatically become visible again for retry
					}
				}
			}
		} catch (error: any) {
			// Ignore abort errors during shutdown
			if (error.name === "AbortError" || error.name === "RequestAbortedError") {
				// console.log(`[Worker ${workerId}] Polling aborted for shutdown`);
				break;
			}

			if (isRunning) {
				console.error(`[Worker ${workerId}] Polling error:`, error.message);
				// Wait a bit before retrying after an error
				await new Promise((resolve) => setTimeout(resolve, 5000));
			}
		}
	}

	console.log(`[Worker ${workerId}] Stopped`);
};

/**
 * Initialize multiple SQS polling workers as async loops in a single process
 */
export const initWorkers = async () => {
	const { db } = initDrizzle({ maxConnections: NUM_WORKERS + 2 });

	console.log(`Starting ${NUM_WORKERS} SQS polling workers...`);

	// Start all polling loops concurrently
	const workers: Promise<void>[] = [];
	for (let i = 0; i < NUM_WORKERS; i++) {
		workers.push(startPollingLoop({ workerId: i + 1, db }));
	}

	// Graceful shutdown handler
	const shutdown = async () => {
		console.log("Shutting down SQS workers...");
		isRunning = false;

		// Abort all in-flight SQS requests immediately
		for (const controller of abortControllers) {
			controller.abort();
		}

		// Give workers 5 seconds to finish current processing
		const shutdownTimeout = setTimeout(() => {
			console.log("Shutdown timeout reached, forcing exit...");
			process.exit(0);
		}, 5000);

		// Wait for clean shutdown
		try {
			await Promise.all(workers);
			clearTimeout(shutdownTimeout);
			console.log("All SQS workers stopped cleanly");
			process.exit(0);
		} catch (error) {
			console.error("Error during shutdown:", error);
			process.exit(1);
		}
	};

	process.on("SIGTERM", shutdown);
	process.on("SIGINT", shutdown);

	// Wait for all workers to finish (on shutdown)
	await Promise.all(workers);
	console.log("All SQS workers stopped");
};

