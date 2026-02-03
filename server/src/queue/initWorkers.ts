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
import { syncItemV3 } from "@/internal/balances/utils/sync/syncItemV3.js";
import { sendProductsUpdated } from "@/internal/billing/v2/workflows/sendProductsUpdated/sendProductsUpdated.js";
import { verifyCacheConsistency } from "@/internal/billing/v2/workflows/verifyCacheConsistency/verifyCacheConsistency.js";
import { runClearCreditSystemCacheTask } from "@/internal/features/featureActions/runClearCreditSystemCacheTask.js";
import { generateFeatureDisplay } from "@/internal/features/workflows/generateFeatureDisplay.js";
import { runMigrationTask } from "@/internal/migrations/runMigrationTask.js";
import { runRewardMigrationTask } from "@/internal/migrations/runRewardMigrationTask.js";
import { detectBaseVariant } from "@/internal/products/productUtils/detectProductVariant.js";
import { runTriggerCheckoutReward } from "@/internal/rewards/triggerCheckoutReward.js";
import { generateId } from "@/utils/genUtils.js";
import { addWorkflowToLogs } from "@/utils/logging/addContextToLogs.js";
import { hatchet } from "../external/hatchet/initHatchet.js";
import { setSentryTags } from "../external/sentry/sentryUtils.js";
import { createWorkerContext } from "./createWorkerContext.js";
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

	const workerLogger = addWorkflowToLogs({
		logger: logger,
		workflowContext: {
			id: message.MessageId ?? generateId("job"),
			name: job.name,
			payload: job.data,
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

		if (job.name === JobName.GenerateFeatureDisplay) {
			if (!ctx) {
				workerLogger.error("No context found for generate feature display job");
				return;
			}
			await generateFeatureDisplay({
				ctx,
				payload: job.data,
			});
			return;
		}

		if (job.name === JobName.SendProductsUpdated) {
			if (!ctx) {
				workerLogger.error("No context found for send products updated job");
				return;
			}
			await sendProductsUpdated({
				ctx,
				payload: job.data,
			});
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
			if (!ctx) {
				workerLogger.error("No context found for trigger checkout reward job");
				return;
			}
			await runTriggerCheckoutReward({
				ctx,
				payload: job.data,
			});
		}
	} catch (error) {
		Sentry.captureException(error);
		if (error instanceof Error) {
			workerLogger.error(`Failed to process SQS job: ${job.name}`, {
				jobName: job.name,
				error: {
					message: error.message,
					stack: error.stack,
				},
			});
		}
	}
};

let isRunning = true;
const isFifoQueue = QUEUE_URL.endsWith(".fifo");
let abortController: AbortController;

// Tracking for periodic stats
let messagesProcessed = 0;
let lastStatsTime = Date.now();

/**
 * Single SQS polling loop - runs continuously until shutdown
 */
const startPollingLoop = async ({ db }: { db: DrizzleCli }) => {
	console.log(`[SQS Worker ${process.pid}] Started polling ${QUEUE_URL}`);
	abortController = new AbortController();

	// Log stats every 60 seconds
	const statsInterval = setInterval(() => {
		const elapsed = ((Date.now() - lastStatsTime) / 1000).toFixed(0);
		console.log(`[SQS Worker ${process.pid}] Processed ${messagesProcessed} messages in ${elapsed}s`);
		messagesProcessed = 0;
		lastStatsTime = Date.now();
	}, 60000);

	while (isRunning) {
		try {
			const command = new ReceiveMessageCommand({
				QueueUrl: QUEUE_URL,
				MaxNumberOfMessages: 10,
				WaitTimeSeconds: 20,
				VisibilityTimeout: 30,
				...(isFifoQueue && {
					ReceiveRequestAttemptId: generateId("receive"),
				}),
			});

			const response = await sqs.send(command, {
				abortSignal: abortController.signal,
			});

			if (response.Messages && response.Messages.length > 0) {
				await Promise.allSettled(
					response.Messages.map(async (message) => {
						if (!isRunning || !message.Body) return;

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
							messagesProcessed++;
						} catch (error) {
							if (error instanceof Error) {
								logger.error(
									`Failed to process message ${message.MessageId}: ${error.message}`,
								);
							}
						}

						if (message.ReceiptHandle) {
							try {
								await sqs.send(
									new DeleteMessageCommand({
										QueueUrl: QUEUE_URL,
										ReceiptHandle: message.ReceiptHandle,
									}),
								);
							} catch (deleteError: any) {
								console.error(`Failed to delete message: ${deleteError.message}`);
							}
						}
					}),
				);
			}
		} catch (error: any) {
			if (error.name === "AbortError" || error.name === "RequestAbortedError") {
				console.log(`[SQS Worker ${process.pid}] Polling aborted (shutdown)`);
				break;
			}

			if (isRunning) {
				console.error(`[SQS Worker ${process.pid}] Polling error: ${error.message}`);
				await new Promise((resolve) => setTimeout(resolve, 5000));
			}
		}
	}

	clearInterval(statsInterval);
	console.log(`[SQS Worker ${process.pid}] Stopped`);
};

/**
 * Initialize single SQS poller for this process
 * cluster.fork() in workers.ts handles multi-process parallelism
 */
export const initWorkers = async () => {
	const { db } = initDrizzle({ maxConnections: 3 });

	const shutdown = async () => {
		console.log(`[SQS Worker ${process.pid}] Shutting down...`);
		isRunning = false;
		if (abortController) abortController.abort();

		const isProd = process.env.NODE_ENV === "production";
		if (isProd) {
			setTimeout(() => process.exit(0), 5000);
		} else {
			process.exit(0);
		}
	};

	process.on("SIGTERM", shutdown);
	process.on("SIGINT", shutdown);

	await startPollingLoop({ db });
};

export const initHatchetWorker = async () => {
	if (!hatchet) {
		console.log("⏭️  Hatchet not configured, skipping worker startup");
		return;
	}

	try {
		console.log("Starting hatchet worker");

		const worker = await hatchet.worker("hatchet-worker", {
			workflows: [verifyCacheConsistency!],
		});

		// Don't await - start() runs indefinitely and would block the rest of the code
		// But catch errors to prevent unhandled promise rejections from crashing
		worker.start().catch((error) => {
			console.error("Hatchet worker error (non-fatal):", error.message);
			Sentry.captureException(error);
		});
	} catch (error) {
		console.error("Failed to start hatchet worker", error);
		Sentry.captureException(error);
	}
};
