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
import { withTimeout } from "@/utils/withTimeout.js";
import { hatchet } from "../external/hatchet/initHatchet.js";
import { getSqsClient, QUEUE_URL, recreateSqsClient } from "./initSqs.js";
import { JobName } from "./JobName.js";
import { processMessage, type SqsJob } from "./processMessage.js";

// ============ Shared State ============
let isRunning = true;
let abortController: AbortController;

// Process recycling — exit after processing this many messages to prevent memory leaks
const MAX_MESSAGES_BEFORE_RECYCLE = 50_000;

// Idle self-kill — exit if worker processes 0 messages for this many consecutive intervals
const IDLE_SELF_KILL_THRESHOLD = 5; // ~5 min of 0 messages (5 * 60s)
const shouldIdleSelfKill = process.env.NODE_ENV !== "development";

// Per-message processing timeout — must be under VisibilityTimeout (30s)
const MESSAGE_TIMEOUT_MS = 25_000;

// Jobs that can exceed the 30s VisibilityTimeout. We ACK the SQS message
// before processing so it is never redelivered mid-flight. These jobs must
// be idempotency-tolerant since a worker crash means the work is lost.
const LONG_RUNNING_JOBS = new Set<JobName>([
	JobName.Migration,
	JobName.RewardMigration,
	JobName.ClearCreditSystemCustomerCache,
	JobName.BatchResetCusEnts,
]);

// Stale connection detection
const EMPTY_POLL_THRESHOLD = 9; // ~3 min of empty polls (9 * 20s wait)
const HEARTBEAT_INTERVAL_MS = ms.minutes(5);

// Zero-message alert tracking
const ZERO_MESSAGE_ALERT_THRESHOLD = 20; // ~20 min of 0 messages

// ============ Helper Functions ============

const logPrefix = ({ queueUrl }: { queueUrl: string }) =>
	`[SQS Worker ${process.pid}][${queueUrl.split("/").pop()}]`;

// ============ Polling Loop (per-queue, per-loop state) ============

const startPollingLoop = async ({
	db,
	queueUrl,
	isFifo,
	getSqsClientFn,
	recreateSqsClientFn,
}: {
	db: DrizzleCli;
	queueUrl: string;
	isFifo: boolean;
	getSqsClientFn: () => SQSClient;
	recreateSqsClientFn: () => SQSClient;
}) => {
	// Per-loop state
	let messagesProcessed = 0;
	let totalMessagesProcessed = 0;
	let lastStatsTime = Date.now();
	let activeLongRunningJobs = 0;
	let consecutiveEmptyPolls = 0;
	let lastHeartbeatTime = Date.now();
	let consecutiveZeroMessageIntervals = 0;

	const prefix = logPrefix({ queueUrl });

	const alertZeroMessages = () => {
		const minutes = consecutiveZeroMessageIntervals;
		logger.warn(`${prefix} No messages processed for ${minutes} minutes`, {
			type: "worker",
			queueUrl,
			consecutiveIntervals: minutes,
		});
		Sentry.captureMessage(
			`SQS Worker ${process.pid} (${queueUrl}): No messages processed for ${minutes} minutes`,
			"warning",
		);
	};

	const recycleWorkerIfNeeded = () => {
		if (totalMessagesProcessed < MAX_MESSAGES_BEFORE_RECYCLE) {
			return;
		}

		if (activeLongRunningJobs > 0) {
			console.log(
				`${prefix} Recycle deferred at ${totalMessagesProcessed} messages because ${activeLongRunningJobs} long-running job(s) are still running`,
			);
			return;
		}

		const mem = process.memoryUsage();
		console.log(
			`${prefix} Recycling after ${totalMessagesProcessed} messages (rss=${(mem.rss / 1024 / 1024).toFixed(0)}MB heap=${(mem.heapUsed / 1024 / 1024).toFixed(0)}MB)`,
		);
		clearInterval(statsInterval);
		process.exit(0);
	};

	const logStatsAndCheckZeroMessages = () => {
		const elapsedSeconds = ((Date.now() - lastStatsTime) / 1000).toFixed(0);
		const mem = process.memoryUsage();
		console.log(
			`${prefix} Processed ${messagesProcessed} messages in ${elapsedSeconds}s | rss=${(mem.rss / 1024 / 1024).toFixed(0)}MB heap=${(mem.heapUsed / 1024 / 1024).toFixed(0)}MB total=${totalMessagesProcessed}`,
		);

		if (messagesProcessed === 0) {
			consecutiveZeroMessageIntervals++;

			if (
				shouldIdleSelfKill &&
				consecutiveZeroMessageIntervals >= IDLE_SELF_KILL_THRESHOLD &&
				totalMessagesProcessed > 0 &&
				activeLongRunningJobs === 0
			) {
				console.log(
					`${prefix} Idle self-kill: 0 messages for ${consecutiveZeroMessageIntervals} intervals after processing ${totalMessagesProcessed} total. Exiting for cluster respawn.`,
				);
				process.exit(0);
			}

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
			QueueUrl: queueUrl,
			MaxNumberOfMessages: 10,
			WaitTimeSeconds: 20,
			VisibilityTimeout: 30,
			...(isFifo && { ReceiveRequestAttemptId: generateId("receive") }),
		});

	const deleteMessageImmediately = async ({
		sqs,
		message,
		job,
	}: {
		sqs: SQSClient;
		message: Message;
		job: SqsJob;
	}) => {
		logger.info(
			`Returning success immediately for long-running job ${job.name} (messageId=${message.MessageId})`,
		);
		await sqs.send(
			new DeleteMessageCommand({
				QueueUrl: queueUrl,
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

		// Long-running jobs: delete IMMEDIATELY before processing to avoid
		// visibility-timeout redelivery loops (the handler can take longer than
		// VisibilityTimeout, so SQS would otherwise re-dispatch the same message
		// to other workers while the first one is still running).
		const isLongRunning = LONG_RUNNING_JOBS.has(job.name as JobName);
		if (isLongRunning) {
			await deleteMessageImmediately({ sqs, message, job });
		}

		if (isLongRunning) {
			await processMessage({ message, db });
		} else {
			await withTimeout({
				timeoutMs: MESSAGE_TIMEOUT_MS,
				timeoutMessage: `Processing timed out after ${MESSAGE_TIMEOUT_MS}ms`,
				fn: () => processMessage({ message, db }),
			});
		}

		messagesProcessed++;
		totalMessagesProcessed++;

		// Return delete info (skip long-running jobs - already deleted)
		if (message.ReceiptHandle && !isLongRunning) {
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
				new DeleteMessageBatchCommand({
					QueueUrl: queueUrl,
					Entries: toDelete,
				}),
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			console.error(`${prefix} Batch delete failed: ${message}`);
		}
	};

	const handleEmptyPoll = (): SQSClient | null => {
		consecutiveEmptyPolls++;

		const now = Date.now();
		if (now - lastHeartbeatTime > HEARTBEAT_INTERVAL_MS) {
			console.log(
				`${prefix} Heartbeat - polling active, ${consecutiveEmptyPolls} consecutive empty polls`,
			);
			lastHeartbeatTime = now;
		}

		if (consecutiveEmptyPolls >= EMPTY_POLL_THRESHOLD) {
			console.warn(
				`${prefix} ${consecutiveEmptyPolls} consecutive empty polls - recreating SQS client`,
			);
			consecutiveEmptyPolls = 0;
			abortController = new AbortController();
			return recreateSqsClientFn();
		}

		return null;
	};

	const handlePollingError = async (
		error: unknown,
	): Promise<SQSClient | null> => {
		const err = error as { name?: string; message?: string };

		if (err.name === "AbortError" || err.name === "RequestAbortedError") {
			console.log(`${prefix} Polling aborted (shutdown)`);
			return null;
		}

		if (!isRunning) return null;

		console.error(`${prefix} Polling error: ${err.message}`);

		consecutiveEmptyPolls++;
		if (consecutiveEmptyPolls >= EMPTY_POLL_THRESHOLD) {
			console.warn(`${prefix} Repeated errors - recreating SQS client`);
			consecutiveEmptyPolls = 0;
			abortController = new AbortController();
			await new Promise((resolve) => setTimeout(resolve, 5000));
			return recreateSqsClientFn();
		}

		await new Promise((resolve) => setTimeout(resolve, 5000));
		return null;
	};

	const statsInterval = setInterval(logStatsAndCheckZeroMessages, 60000);

	let sqs = getSqsClientFn();

	while (isRunning) {
		try {
			const response = await sqs.send(createReceiveCommand(), {
				abortSignal: abortController.signal,
			});

			const messages = response.Messages ?? [];

			if (messages.length > 0) {
				consecutiveEmptyPolls = 0;

				const regularMessages: Message[] = [];
				for (const message of messages) {
					if (!message.Body) continue;
					const job: SqsJob = JSON.parse(message.Body);
					if (LONG_RUNNING_JOBS.has(job.name as JobName)) {
						activeLongRunningJobs++;
						handleSingleMessage({ sqs, message, db })
							.catch((error) => {
								console.error(
									`${prefix} Long-running job ${job.name} failed:`,
									error instanceof Error ? error.message : error,
								);
								Sentry.captureException(error);
							})
							.finally(() => activeLongRunningJobs--);
					} else {
						regularMessages.push(message);
					}
				}

				const results = await Promise.allSettled(
					regularMessages.map((message) =>
						handleSingleMessage({ sqs, message, db }),
					),
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

				Sentry.getCurrentScope().clear();
				recycleWorkerIfNeeded();
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
	console.log(`${prefix} Stopped`);
};

/**
 * Initialize SQS pollers for this process.
 * cluster.fork() in workers.ts handles multi-process parallelism.
 */
export const initWorkers = async ({
	startupStartedAt,
	queueImplementation,
}: {
	startupStartedAt: number;
	queueImplementation: string;
}) => {
	const { db } = initDrizzle({ maxConnections: 10 });
	const { warmupRegionalRedis } = await import("@/external/redis/initRedis.js");
	await warmupRegionalRedis();

	const shutdown = async () => {
		console.log(`[SQS Worker ${process.pid}] Shutting down...`);
		isRunning = false;
		if (abortController) abortController.abort();

		const isProd = process.env.NODE_ENV === "production";
		if (isProd) {
			const shutdownTimeout = setTimeout(() => process.exit(0), 5000);
			if (shutdownTimeout.unref) {
				shutdownTimeout.unref();
			}
		} else {
			process.exit(0);
		}
	};

	process.on("SIGTERM", shutdown);
	process.on("SIGINT", shutdown);

	abortController = new AbortController();

	const startupDurationMs = Date.now() - startupStartedAt;
	console.log(
		`[Worker ${process.pid}] ${queueImplementation} worker ready in ${startupDurationMs}ms`,
	);

	await startPollingLoop({
		db,
		queueUrl: QUEUE_URL,
		isFifo: QUEUE_URL.endsWith(".fifo"),
		getSqsClientFn: getSqsClient,
		recreateSqsClientFn: recreateSqsClient,
	});
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

		worker.start().catch((error) => {
			console.error("Hatchet worker error (non-fatal):", error.message);
			Sentry.captureException(error);
		});
	} catch (error) {
		console.error("Failed to start hatchet worker", error);
		Sentry.captureException(error);
	}
};
