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
import {
	isJobQueueEnabled,
	JOB_QUEUE_IDS,
} from "@/internal/misc/jobQueues/jobQueueStore.js";
import { generateId } from "@/utils/genUtils.js";
import { withTimeout } from "@/utils/withTimeout.js";
import { hatchet } from "../external/hatchet/initHatchet.js";
import { isActiveSlot } from "./blueGreen/blueGreenGate.js";
import {
	recordMessagesReceived,
	recordPollAttempt,
} from "./blueGreen/blueGreenHeartbeat.js";
import { initBlueGreen, shutdownBlueGreen } from "./blueGreen/initBlueGreen.js";
import { getSqsClient, QUEUE_URL, recreateSqsClient } from "./initSqs.js";
import { JobName } from "./JobName.js";
import { processMessage, type SqsJob } from "./processMessage.js";

// ============ Shared State ============
let isRunning = true;
const abortControllers = new Set<AbortController>();
export const getAbortControllerCountForTesting = () => abortControllers.size;

// Process recycling — exit after processing this many messages to prevent memory leaks
const MAX_MESSAGES_BEFORE_RECYCLE = 50_000;

// Idle self-kill — exit if worker processes 0 messages for this many consecutive intervals
const IDLE_SELF_KILL_THRESHOLD = 5; // ~5 min of 0 messages (5 * 60s)
const shouldIdleSelfKill = process.env.NODE_ENV !== "development";

// Per-message processing timeout — must be under VisibilityTimeout (30s)
const MESSAGE_TIMEOUT_MS = 25_000;

type JobOverride = {
	ackUpfront: true;
	dispatch: "inline" | "background";
};

// Jobs whose handlers can exceed the 30s VisibilityTimeout. ACK upfront to
// avoid redelivery loops; dispatch mode controls whether the poll loop awaits
// them (inline → preserves backpressure) or fires in background (→ no
// backpressure; only safe for genuinely rare, low-volume jobs).
const JOB_OVERRIDES: Partial<Record<JobName, JobOverride>> = {
	// Rare (handful per day); fire-and-forget is safe.
	[JobName.Migration]: { ackUpfront: true, dispatch: "background" },
	// Can exceed VisibilityTimeout on large orgs; redelivery causes a
	// self-amplifying Redis UNLINK storm. Inline so one worker's concurrency
	// stays capped at the receive batch size.
	[JobName.ClearCreditSystemCustomerCache]: {
		ackUpfront: true,
		dispatch: "inline",
	},
};

const getJobOverride = (jobName: string): JobOverride | undefined =>
	JOB_OVERRIDES[jobName as JobName];

// Stale connection detection
const EMPTY_POLL_THRESHOLD = 9; // ~3 min of empty polls (9 * 20s wait)
const HEARTBEAT_INTERVAL_MS = ms.minutes(5);

// Zero-message alert tracking
const ZERO_MESSAGE_ALERT_THRESHOLD = 20; // ~20 min of 0 messages

// ============ Helper Functions ============

const logPrefix = ({ queueUrl }: { queueUrl: string }) =>
	`[SQS Worker ${process.pid}][${queueUrl.split("/").pop()}]`;

// ============ Polling Loop (per-queue, per-loop state) ============

export const startPollingLoop = async ({
	db,
	queueUrl,
	isFifo,
	getSqsClientFn,
	recreateSqsClientFn,
	shouldPoll = () => true,
}: {
	db: DrizzleCli;
	queueUrl: string;
	isFifo: boolean;
	getSqsClientFn: () => SQSClient;
	recreateSqsClientFn: () => SQSClient;
	shouldPoll?: () => boolean;
}) => {
	// Per-loop state
	let messagesProcessed = 0;
	let totalMessagesProcessed = 0;
	let lastStatsTime = Date.now();
	let activeMigrationJobs = 0;
	let consecutiveEmptyPolls = 0;
	let lastHeartbeatTime = Date.now();
	let consecutiveZeroMessageIntervals = 0;

	const prefix = logPrefix({ queueUrl });
	let abortController = new AbortController();
	abortControllers.add(abortController);
	const replaceAbortController = () => {
		abortControllers.delete(abortController);
		abortController = new AbortController();
		abortControllers.add(abortController);
	};

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

		if (activeMigrationJobs > 0) {
			console.log(
				`${prefix} Recycle deferred at ${totalMessagesProcessed} messages because ${activeMigrationJobs} migration job(s) are still running`,
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
		if (!shouldPoll()) {
			consecutiveZeroMessageIntervals = 0;
			messagesProcessed = 0;
			lastStatsTime = Date.now();
			return;
		}

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
				activeMigrationJobs === 0
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

	const ackMessageUpfront = async ({
		sqs,
		message,
		job,
	}: {
		sqs: SQSClient;
		message: Message;
		job: SqsJob;
	}) => {
		logger.info(`ACKing ${job.name} upfront (messageId=${message.MessageId})`);
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
		const override = getJobOverride(job.name);

		if (override?.ackUpfront) {
			await ackMessageUpfront({ sqs, message, job });
		}

		if (override) {
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

		if (message.ReceiptHandle && !override?.ackUpfront) {
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
			replaceAbortController();
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
			replaceAbortController();
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
			if (!shouldPoll()) {
				consecutiveEmptyPolls = 0;
				await new Promise((resolve) => setTimeout(resolve, 5000));
				continue;
			}

			recordPollAttempt({ queueUrl });
			const response = await sqs.send(createReceiveCommand(), {
				abortSignal: abortController.signal,
			});

			const messages = response.Messages ?? [];

			if (messages.length > 0) {
				recordMessagesReceived({ queueUrl, count: messages.length });
				consecutiveEmptyPolls = 0;

				const regularMessages: Message[] = [];
				for (const message of messages) {
					if (!message.Body) continue;
					const job: SqsJob = JSON.parse(message.Body);
					const override = getJobOverride(job.name);
					if (override?.dispatch === "background") {
						activeMigrationJobs++;
						handleSingleMessage({ sqs, message, db })
							.catch((error) => {
								console.error(
									`${prefix} Background job ${job.name} failed:`,
									error instanceof Error ? error.message : error,
								);
								Sentry.captureException(error);
							})
							.finally(() => activeMigrationJobs--);
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

	abortControllers.delete(abortController);
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

	await initBlueGreen({ logger });

	const shutdown = async () => {
		console.log(`[SQS Worker ${process.pid}] Shutting down...`);
		isRunning = false;
		shutdownBlueGreen();
		for (const controller of abortControllers) {
			controller.abort();
		}

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

	const startupDurationMs = Date.now() - startupStartedAt;
	console.log(
		`[Worker ${process.pid}] ${queueImplementation} worker ready in ${startupDurationMs}ms`,
	);
	const pollingLoops = [];

	for (const { queueId, queueUrl } of [
		{
			queueId: JOB_QUEUE_IDS.primary,
			queueUrl: QUEUE_URL,
		},
		{
			queueId: JOB_QUEUE_IDS.track,
			queueUrl: process.env.TRACK_SQS_QUEUE_URL,
		},
	]) {
		if (!queueUrl) continue;

		pollingLoops.push(
			startPollingLoop({
				db,
				queueUrl,
				isFifo: queueUrl.endsWith(".fifo"),
				getSqsClientFn: getSqsClient,
				recreateSqsClientFn: recreateSqsClient,
				shouldPoll: () =>
					isJobQueueEnabled({ queue: queueId }) && isActiveSlot(),
			}),
		);
	}

	await Promise.all(pollingLoops);
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
