await import("../sentry.js");

import {
	DeleteMessageCommand,
	type Message,
	ReceiveMessageCommand,
} from "@aws-sdk/client-sqs";
import * as Sentry from "@sentry/bun";
import type { Logger } from "pino";
import { type DrizzleCli, initDrizzle } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { runActionHandlerTask } from "@/internal/analytics/runActionHandlerTask.js";
import { runInsertEventBatch } from "@/internal/balances/events/runInsertEventBatch.js";
import { runSyncBalanceBatch } from "@/internal/balances/utils/sync/legacy/runSyncBalanceBatch.js";
import { syncItemV2 } from "@/internal/balances/utils/sync/legacy/syncItemV2.js";
import { syncItemV3 } from "@/internal/balances/utils/sync/syncItemV3.js";
import { runClearCreditSystemCacheTask } from "@/internal/features/featureActions/runClearCreditSystemCacheTask.js";
import { runSaveFeatureDisplayTask } from "@/internal/features/featureUtils.js";
import { runMigrationTask } from "@/internal/migrations/runMigrationTask.js";
import { runRewardMigrationTask } from "@/internal/migrations/runRewardMigrationTask.js";
import { detectBaseVariant } from "@/internal/products/productUtils/detectProductVariant.js";
import { runTriggerCheckoutReward } from "@/internal/rewards/triggerCheckoutReward.js";
import { generateId } from "@/utils/genUtils.js";
import { hatchet } from "../external/hatchet/initHatchet.js";
import { setSentryTags } from "../external/sentry/sentryUtils.js";
import { createWorkerContext } from "./createWorkerContext.js";
import { verifyCacheConsistencyWorkflow } from "./hatchetWorkflows/verifyCacheConsistencyWorkflow/verifyCacheConsistencyWorkflow.js";
import { QUEUE_URL, sqs } from "./initSqs.js";
import { JobName } from "./JobName.js";

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
}: {
	message: Message;
	db: DrizzleCli;
}) => {
	if (!message.Body) {
		console.warn("Received message without body");
		return;
	}

	const job: SqsJob = JSON.parse(message.Body);

	const workerLogger = logger.child({
		context: {
			worker: {
				messageId: message.MessageId,
				type: job.name,
				payload: job.data,
			},
		},
	});

	workerLogger.info(`Processing message: ${job.name}`);

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

		if (job.name === JobName.ClearCreditSystemCustomerCache) {
			await runClearCreditSystemCacheTask({
				db,
				payload: job.data,
				logger: workerLogger,
			});
			return;
		}

		// Jobs below need worker context
		const ctx = await createWorkerContext({
			db,
			payload: job.data,
			logger: workerLogger,
		});

		if (ctx) {
			setSentryTags({
				ctx,
				messageId: message.MessageId,
			});
		}

		if (job.name === JobName.Migration) {
			if (!ctx) {
				workerLogger.error("No context found for migration job");
				return;
			}
			await runMigrationTask({ ctx, payload: job.data });
			return;
		}

		if (actionHandlers.includes(job.name as JobName)) {
			// Note: action handlers need BullMQ queue for nested jobs
			// This will need to be refactored when migrating action handlers to SQS
			await runActionHandlerTask({
				ctx,
				jobName: job.name as JobName,
				payload: job.data,
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
				ctx,
				payload: job.data,
			});
			return;
		}

		if (job.name === JobName.SyncBalanceBatchV2) {
			if (!ctx) {
				workerLogger.error("No context found for sync balance batch v2 job");
				return;
			}

			await syncItemV2({
				ctx,
				item: job.data.item,
			});
			return;
		}

		if (job.name === JobName.SyncBalanceBatchV3) {
			if (!ctx) {
				workerLogger.error("No context found for sync balance batch v3 job");
				return;
			}

			await syncItemV3({
				ctx,
				payload: job.data,
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
		Sentry.captureException(error);
		workerLogger.error(`Failed to process SQS job: ${job.name}`, {
			jobName: job.name,
			error: {
				message: error.message,
				stack: error.stack,
			},
		});
	}
};

let isRunning = true;
const isFifoQueue = QUEUE_URL.endsWith(".fifo");
let abortController: AbortController;

/**
 * Single SQS polling loop - runs continuously until shutdown
 */
const startPollingLoop = async ({ db }: { db: DrizzleCli }) => {
	console.log(`[Process ${process.pid}] SQS poller started`);
	abortController = new AbortController();

	while (isRunning) {
		try {
			const command = new ReceiveMessageCommand({
				QueueUrl: QUEUE_URL,
				MaxNumberOfMessages: 10, // Receive up to 10 messages at once
				WaitTimeSeconds: 20, // Long polling
				VisibilityTimeout: 30, // 12 hours (max) - prevents duplicate processing of long-running jobs
				// For FIFO queues, add ReceiveRequestAttemptId for deduplication
				...(isFifoQueue && {
					ReceiveRequestAttemptId: generateId("receive"),
				}),
			});

			const response = await sqs.send(command, {
				abortSignal: abortController.signal,
			});

			if (response.Messages && response.Messages.length > 0) {
				// Process all messages concurrently
				await Promise.allSettled(
					response.Messages.map(async (message) => {
						// Check if we should stop before processing
						if (!isRunning || !message.Body) return;

						// If migration job, return success immediately to avoid duplicate processing
						const job: SqsJob = JSON.parse(message.Body);
						if (job.name === JobName.Migration) {
							logger.info(
								`Returning success immediately for migration job ${job.data.migrationJobId}`,
							);
							await sqs.send(
								new DeleteMessageCommand({
									QueueUrl: QUEUE_URL,
									ReceiptHandle: message.ReceiptHandle,
								}),
							);
						}

						try {
							await processMessage({ message, db });
						} catch (error: any) {
							logger.error(
								`Failed to process message ${message.MessageId}: ${error.message}`,
							);
						}

						// Always delete message, even on error (receive once only)
						if (message.ReceiptHandle) {
							try {
								await sqs.send(
									new DeleteMessageCommand({
										QueueUrl: QUEUE_URL,
										ReceiptHandle: message.ReceiptHandle,
									}),
								);
							} catch (deleteError: any) {
								console.error(
									`Failed to delete message ${message.MessageId}:`,
									deleteError.message,
								);
							}
						}
					}),
				);
			}
		} catch (error: any) {
			// Ignore abort errors during shutdown
			if (error.name === "AbortError" || error.name === "RequestAbortedError") {
				break;
			}

			if (isRunning) {
				console.error("SQS polling error:", error.message);
				// Wait a bit before retrying after an error
				await new Promise((resolve) => setTimeout(resolve, 5000));
			}
		}
	}

	console.log("SQS poller stopped");
};

/**
 * Initialize single SQS poller for this process
 * cluster.fork() in workers.ts handles multi-process parallelism
 */
export const initWorkers = async () => {
	const { db } = initDrizzle({ maxConnections: 3 });

	// Graceful shutdown handler
	const shutdown = async () => {
		console.log("Shutting down SQS poller...");
		isRunning = false;

		// Abort in-flight SQS request
		if (abortController) {
			abortController.abort();
		}

		// In production, give 5 seconds to finish current message processing
		// In development, exit immediately for faster hot reloads
		const isProd = process.env.NODE_ENV === "production";
		if (isProd) {
			setTimeout(() => {
				console.log("Shutdown timeout reached, forcing exit");
				process.exit(0);
			}, 5000);
		} else {
			console.log("Development mode: exiting immediately");
			process.exit(0);
		}
	};

	process.on("SIGTERM", shutdown);
	process.on("SIGINT", shutdown);

	// Start the single polling loop
	await startPollingLoop({ db });
};

export const initHatchetWorker = async () => {
	if (!hatchet) {
		console.log("⏭️  Hatchet not configured, skipping worker startup");
		return;
	}

	console.log("Starting hatchet worker");

	const worker = await hatchet.worker("hatchet-worker", {
		workflows: [verifyCacheConsistencyWorkflow!],
	});

	// Don't await - start() runs indefinitely and would block the rest of the code
	worker.start();
};
