await import("../sentry.js");

import { ms } from "@autumn/shared";
import {
	DeleteMessageBatchCommand,
	DeleteMessageCommand,
	type Message,
	ReceiveMessageCommand,
	type SQSClient,
} from "@aws-sdk/client-sqs";
import * as Sentry from "@sentry/bun";
import { type DrizzleCli, initDrizzle } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { verifyCacheConsistency } from "@/internal/billing/v2/workflows/verifyCacheConsistency/verifyCacheConsistency.js";
import { generateId } from "@/utils/genUtils.js";
import { hatchet } from "../external/hatchet/initHatchet.js";
import { getSqsClient, QUEUE_URL, recreateSqsClient } from "./initSqs.js";
import { JobName } from "./JobName.js";
import { processMessage, type SqsJob } from "./processMessage.js";

// ============ State ============
let isRunning = true;
let abortController: AbortController;
const isFifoQueue = QUEUE_URL.endsWith(".fifo");

// Stats tracking
let messagesProcessed = 0;
let totalMessagesProcessed = 0;
let lastStatsTime = Date.now();

// Process recycling — exit after processing this many messages to prevent memory leaks
const MAX_MESSAGES_BEFORE_RECYCLE = 500_000;

// Stale connection detection
let consecutiveEmptyPolls = 0;
let lastHeartbeatTime = Date.now();
const EMPTY_POLL_THRESHOLD = 9; // ~3 min of empty polls (9 * 20s wait)
const HEARTBEAT_INTERVAL_MS = ms.minutes(5);

// Zero-message alert tracking
let consecutiveZeroMessageIntervals = 0;
const ZERO_MESSAGE_ALERT_THRESHOLD = 20; // ~20 min of 0 messages

// ============ Helper Functions ============

const logPrefix = () => `[SQS Worker ${process.pid}]`;

const alertZeroMessages = () => {
	const minutes = consecutiveZeroMessageIntervals;
	logger.warn(`${logPrefix()} No messages processed for ${minutes} minutes`, {
		type: "worker",
		queueUrl: QUEUE_URL,
		consecutiveIntervals: minutes,
	});
	Sentry.captureMessage(
		`SQS Worker ${process.pid}: No messages processed for ${minutes} minutes`,
		"warning",
	);
};

const logStatsAndCheckZeroMessages = () => {
	const elapsedSeconds = ((Date.now() - lastStatsTime) / 1000).toFixed(0);
	const mem = process.memoryUsage();
	console.log(
		`${logPrefix()} Processed ${messagesProcessed} messages in ${elapsedSeconds}s | rss=${(mem.rss / 1024 / 1024).toFixed(0)}MB heap=${(mem.heapUsed / 1024 / 1024).toFixed(0)}MB total=${totalMessagesProcessed}`,
	);

	if (messagesProcessed === 0) {
		consecutiveZeroMessageIntervals++;
		if (consecutiveZeroMessageIntervals >= ZERO_MESSAGE_ALERT_THRESHOLD) {
			alertZeroMessages();
			consecutiveZeroMessageIntervals = 0;
		}
	} else {
		consecutiveZeroMessageIntervals = 0;
	}

	messagesProcessed = 0;
	lastStatsTime = Date.now();
};

const createReceiveCommand = () =>
	new ReceiveMessageCommand({
		QueueUrl: QUEUE_URL,
		MaxNumberOfMessages: 10,
		WaitTimeSeconds: 20,
		VisibilityTimeout: 30,
		...(isFifoQueue && { ReceiveRequestAttemptId: generateId("receive") }),
	});

const deleteMigrationJobImmediately = async ({
	sqs,
	message,
	job,
}: {
	sqs: SQSClient;
	message: Message;
	job: SqsJob;
}) => {
	logger.info(
		`Returning success immediately for migration job ${job.data.migrationJobId}`,
	);
	await sqs.send(
		new DeleteMessageCommand({
			QueueUrl: QUEUE_URL,
			ReceiptHandle: message.ReceiptHandle,
		}),
	);
};

const handleSingleMessage = async ({
	sqs,
	message,
	db,
}: {
	sqs: SQSClient;
	message: Message;
	db: DrizzleCli;
}): Promise<{ id: string; receiptHandle: string } | null> => {
	if (!isRunning || !message.Body) return null;

	const job: SqsJob = JSON.parse(message.Body);

	// Migration jobs: delete IMMEDIATELY before processing (long-running, avoid timeout redelivery)
	if (job.name === JobName.Migration) {
		await deleteMigrationJobImmediately({ sqs, message, job });
	}

	await processMessage({ message, db });
	messagesProcessed++;
	totalMessagesProcessed++;

	// Return delete info (skip migration jobs - already deleted)
	if (message.ReceiptHandle && job.name !== JobName.Migration) {
		return { id: message.MessageId!, receiptHandle: message.ReceiptHandle };
	}
	return null;
};

const batchDeleteMessages = async ({
	sqs,
	toDelete,
}: {
	sqs: SQSClient;
	toDelete: { Id: string; ReceiptHandle: string }[];
}) => {
	if (toDelete.length === 0) return;

	try {
		await sqs.send(
			new DeleteMessageBatchCommand({ QueueUrl: QUEUE_URL, Entries: toDelete }),
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		console.error(`${logPrefix()} Batch delete failed: ${message}`);
	}
};

const handleEmptyPoll = (): SQSClient | null => {
	consecutiveEmptyPolls++;

	// Periodic heartbeat
	const now = Date.now();
	if (now - lastHeartbeatTime > HEARTBEAT_INTERVAL_MS) {
		console.log(
			`${logPrefix()} Heartbeat - polling active, ${consecutiveEmptyPolls} consecutive empty polls`,
		);
		lastHeartbeatTime = now;
	}

	// Recreate client if too many empty polls
	if (consecutiveEmptyPolls >= EMPTY_POLL_THRESHOLD) {
		console.warn(
			`${logPrefix()} ${consecutiveEmptyPolls} consecutive empty polls - recreating SQS client`,
		);
		consecutiveEmptyPolls = 0;
		abortController = new AbortController();
		return recreateSqsClient();
	}

	return null;
};

const handlePollingError = async (
	error: unknown,
): Promise<SQSClient | null> => {
	const err = error as { name?: string; message?: string };

	if (err.name === "AbortError" || err.name === "RequestAbortedError") {
		console.log(`${logPrefix()} Polling aborted (shutdown)`);
		return null;
	}

	if (!isRunning) return null;

	console.error(`${logPrefix()} Polling error: ${err.message}`);

	// Recreate client on repeated errors
	consecutiveEmptyPolls++;
	if (consecutiveEmptyPolls >= EMPTY_POLL_THRESHOLD) {
		console.warn(`${logPrefix()} Repeated errors - recreating SQS client`);
		consecutiveEmptyPolls = 0;
		abortController = new AbortController();
		await new Promise((resolve) => setTimeout(resolve, 5000));
		return recreateSqsClient();
	}

	await new Promise((resolve) => setTimeout(resolve, 5000));
	return null;
};

// ============ Main Polling Loop ============

const startPollingLoop = async ({ db }: { db: DrizzleCli }) => {
	console.log(`${logPrefix()} Started polling ${QUEUE_URL}`);
	abortController = new AbortController();

	const statsInterval = setInterval(logStatsAndCheckZeroMessages, 60000);

	let sqs = getSqsClient();

	while (isRunning) {
		try {
			const response = await sqs.send(createReceiveCommand(), {
				abortSignal: abortController.signal,
			});

			const messages = response.Messages ?? [];

			if (messages.length > 0) {
				consecutiveEmptyPolls = 0;

				const results = await Promise.allSettled(
					messages.map((message) => handleSingleMessage({ sqs, message, db })),
				);

				const toDelete = results
					.filter(
						(
							r,
						): r is PromiseFulfilledResult<{
							id: string;
							receiptHandle: string;
						}> => r.status === "fulfilled" && r.value !== null,
					)
					.map((r) => ({
						Id: r.value.id,
						ReceiptHandle: r.value.receiptHandle,
					}));

				await batchDeleteMessages({ sqs, toDelete });

				// Clear Sentry scope to prevent memory accumulation from breadcrumbs/tags
				Sentry.getCurrentScope().clear();

				// Recycle process to prevent memory leaks from long-running workers
				// Exit with code 0 so cluster primary respawns a fresh worker
				if (totalMessagesProcessed >= MAX_MESSAGES_BEFORE_RECYCLE) {
					const mem = process.memoryUsage();
					console.log(
						`${logPrefix()} Recycling after ${totalMessagesProcessed} messages (rss=${(mem.rss / 1024 / 1024).toFixed(0)}MB heap=${(mem.heapUsed / 1024 / 1024).toFixed(0)}MB)`,
					);
					clearInterval(statsInterval);
					process.exit(0);
				}
			} else {
				const newClient = handleEmptyPoll();
				if (newClient) sqs = newClient;
			}
		} catch (error) {
			const newClient = await handlePollingError(error);
			if (newClient) sqs = newClient;
			else if ((error as { name?: string }).name === "AbortError") break;
		}
	}

	clearInterval(statsInterval);
	console.log(`${logPrefix()} Stopped`);
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
