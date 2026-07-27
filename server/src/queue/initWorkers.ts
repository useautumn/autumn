import "../sentry.js";

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
import { startPgPoolMonitor, stopPgPoolMonitor } from "@/db/pgPoolMonitor.js";
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
import {
	type QueueCapacityLease,
	reserveQueueCapacity,
} from "./concurrency/queueCapacityLease.js";
import { getSqsClient, QUEUE_URL, recreateSqsClient } from "./initSqs.js";
import { JobName } from "./JobName.js";
import { processMessage, type SqsJob } from "./processMessage.js";
import {
	createWorkerActivityTracker,
	type WorkerActivityTracker,
} from "./workerActivityTracker.js";

// ============ Shared State ============
let isRunning = true;
const abortControllers = new Set<AbortController>();
export const getAbortControllerCountForTesting = () => abortControllers.size;

// Process recycling — exit after processing this many messages to prevent memory leaks
const MAX_MESSAGES_BEFORE_RECYCLE = 50_000;

const IDLE_SELF_KILL_MS = ms.minutes(5);
const shouldIdleSelfKill = process.env.NODE_ENV !== "development";

// Per-message processing timeout — must be under VisibilityTimeout (30s)
const MESSAGE_TIMEOUT_MS = 25_000;
// Batch resets legitimately outrun the default bound (up to 1k rows plus Stripe
// anchor checks), so they get a longer one — never an unbounded one.
const BATCH_RESET_MESSAGE_TIMEOUT_MS = ms.minutes(1);
const SQS_RECEIVE_BATCH_LIMIT = 10;
const QUEUE_CAPACITY_RETRY_MS = 1_000;
const DELETE_RETRY_DELAYS_MS = [100, 250, 500] as const;

type JobOverride = {
	ack: "upfront" | "always-after-processing";
	dispatch: "inline" | "background";
	/** Per-message bound. Omit for MESSAGE_TIMEOUT_MS; `null` runs unbounded,
	 * which is only safe when the message is ACKed upfront. */
	timeoutMs?: number | null;
};

// Jobs with nonstandard acknowledgement or dispatch behavior. Inline dispatch
// preserves backpressure; background dispatch is only safe for rare,
// low-volume work that does not use a shared concurrency limit.
const JOB_OVERRIDES: Partial<Record<JobName, JobOverride>> = {
	// Rare (handful per day); fire-and-forget is safe.
	[JobName.Migration]: {
		ack: "upfront",
		dispatch: "background",
		timeoutMs: null,
	},
	// Can exceed VisibilityTimeout on large orgs; redelivery causes a
	// self-amplifying Redis UNLINK storm. Inline so one worker's concurrency
	// stays capped at the receive batch size.
	[JobName.ClearCreditSystemCustomerCache]: {
		ack: "upfront",
		dispatch: "inline",
		timeoutMs: null,
	},
	// A failed reset remains overdue and will be rediscovered by the next scan.
	// Keep it in flight until processing finishes so queue depth and concurrency
	// remain accurate, then ACK failures too so SQS cannot retry indefinitely.
	[JobName.BatchResetCustomerEntitlementsV2]: {
		ack: "always-after-processing",
		dispatch: "inline",
		timeoutMs: BATCH_RESET_MESSAGE_TIMEOUT_MS,
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
	queueId,
	queueUrl,
	isFifo,
	getSqsClientFn,
	recreateSqsClientFn,
	shouldPoll = () => true,
	visibilityTimeoutSeconds = 30,
	workerActivity = createWorkerActivityTracker({
		idleAfterMs: IDLE_SELF_KILL_MS,
	}),
}: {
	db: DrizzleCli;
	queueId: string;
	queueUrl: string;
	isFifo: boolean;
	getSqsClientFn: () => SQSClient;
	recreateSqsClientFn: () => SQSClient;
	shouldPoll?: () => boolean;
	/** Raise for queues whose jobs legitimately run long (e.g. batch resets) —
	 * a message redelivered mid-processing means two workers mutating the same
	 * rows concurrently. */
	visibilityTimeoutSeconds?: number;
	workerActivity?: WorkerActivityTracker;
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

			const idleStatus = workerActivity.getIdleStatus();
			if (shouldIdleSelfKill && idleStatus.shouldRecycle) {
				console.log(
					`[SQS Worker ${process.pid}] Idle self-kill: no messages received across any queue for ${Math.floor(idleStatus.idleForMs / 60_000)} minutes after receiving ${idleStatus.totalMessagesReceived} total. Exiting for cluster respawn.`,
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

	const createReceiveCommand = ({
		maxNumberOfMessages,
	}: {
		maxNumberOfMessages: number;
	}) =>
		new ReceiveMessageCommand({
			QueueUrl: queueUrl,
			MaxNumberOfMessages: maxNumberOfMessages,
			WaitTimeSeconds: 20,
			VisibilityTimeout: visibilityTimeoutSeconds,
			MessageSystemAttributeNames: ["SentTimestamp", "ApproximateReceiveCount"],
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

		if (override?.ack === "upfront") {
			await ackMessageUpfront({ sqs, message, job });
		}

		// Unbounded only when a job opts in explicitly — being in JOB_OVERRIDES
		// at all used to be enough, which let one hung handler wedge the loop.
		const timeoutMs =
			override?.timeoutMs === undefined
				? MESSAGE_TIMEOUT_MS
				: override.timeoutMs;

		try {
			if (timeoutMs === null) {
				await processMessage({ message, db });
			} else {
				await withTimeout({
					timeoutMs,
					timeoutMessage: `Processing timed out after ${timeoutMs}ms`,
					fn: () => processMessage({ message, db }),
				});
			}
		} catch (error) {
			if (override?.ack !== "always-after-processing") throw error;

			console.error(
				`${prefix} ${job.name} failed; ACKing after processing so the next scan can retry it:`,
				error instanceof Error ? error.message : error,
			);
			Sentry.captureException(error);
		}

		messagesProcessed++;
		totalMessagesProcessed++;

		if (message.ReceiptHandle && override?.ack !== "upfront") {
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
		let pending = toDelete;

		for (let attempt = 0; pending.length > 0; attempt++) {
			try {
				const response = await sqs.send(
					new DeleteMessageBatchCommand({
						QueueUrl: queueUrl,
						Entries: pending,
					}),
				);
				const failed = response.Failed ?? [];
				const senderFailures = failed.filter((failure) => failure.SenderFault);
				if (senderFailures.length > 0) {
					const message = `${prefix} SQS rejected ${senderFailures.length} message deletion(s): ${senderFailures.map((failure) => `${failure.Id}:${failure.Code}`).join(", ")}`;
					console.error(message);
					Sentry.captureMessage(message, "error");
				}
				const retryIds = new Set(
					failed
						.filter((failure) => !failure.SenderFault)
						.map((failure) => failure.Id),
				);
				pending = pending.filter((entry) => retryIds.has(entry.Id));
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Unknown error";
				console.error(`${prefix} Batch delete failed: ${message}`);
			}

			const retryDelay = DELETE_RETRY_DELAYS_MS[attempt];
			if (pending.length === 0 || retryDelay === undefined) break;
			await new Promise((resolve) => setTimeout(resolve, retryDelay));
		}

		if (pending.length > 0) {
			const message = `${prefix} Failed to delete ${pending.length} message(s) after ${DELETE_RETRY_DELAYS_MS.length + 1} attempts`;
			console.error(message);
			Sentry.captureMessage(message, "error");
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
		let capacityLease: QueueCapacityLease | null = null;
		let batchWorkStarted = false;
		try {
			if (!shouldPoll()) {
				consecutiveEmptyPolls = 0;
				await new Promise((resolve) => setTimeout(resolve, 5000));
				continue;
			}

			capacityLease = await reserveQueueCapacity({
				queueId,
				requested: SQS_RECEIVE_BATCH_LIMIT,
			});
			if (!capacityLease) {
				await new Promise((resolve) =>
					setTimeout(resolve, QUEUE_CAPACITY_RETRY_MS),
				);
				continue;
			}

			recordPollAttempt({ queueUrl });
			const response = await sqs.send(
				createReceiveCommand({
					maxNumberOfMessages: capacityLease.capacity,
				}),
				{
					abortSignal: abortController.signal,
				},
			);

			const messages = response.Messages ?? [];
			if (messages.length > 0) {
				workerActivity.recordMessagesReceived({ count: messages.length });
				workerActivity.startWork();
				batchWorkStarted = true;
			}
			const leasedMessages = await capacityLease.assign(messages);

			if (messages.length > 0) {
				recordMessagesReceived({ queueUrl, count: messages.length });
				consecutiveEmptyPolls = 0;

				const regularMessages: {
					message: Message;
					releaseCapacity: () => Promise<void>;
				}[] = [];
				for (const { item: message, release } of leasedMessages) {
					if (!message.Body) continue;
					const job: SqsJob = JSON.parse(message.Body);
					const override = getJobOverride(job.name);
					if (override?.dispatch === "background" && !capacityLease.isLimited) {
						activeMigrationJobs++;
						workerActivity.startWork();
						handleSingleMessage({ sqs, message, db })
							.catch((error) => {
								console.error(
									`${prefix} Background job ${job.name} failed:`,
									error instanceof Error ? error.message : error,
								);
								Sentry.captureException(error);
							})
							.finally(() => {
								activeMigrationJobs--;
								workerActivity.finishWork();
							});
					} else {
						regularMessages.push({
							message,
							releaseCapacity: release,
						});
					}
				}

				const results = await Promise.allSettled(
					regularMessages.map(({ message, releaseCapacity }) =>
						handleSingleMessage({ sqs, message, db }).finally(() =>
							releaseCapacity(),
						),
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
		} finally {
			if (batchWorkStarted) workerActivity.finishWork();
			await capacityLease?.release();
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
	const { db } = initDrizzle({ name: "worker", maxConnections: 40 });
	startPgPoolMonitor();
	const { warmupRegionalRedis } = await import("@/external/redis/initRedis.js");
	await warmupRegionalRedis();

	await initBlueGreen({ db, logger });

	const shutdown = async () => {
		console.log(`[SQS Worker ${process.pid}] Shutting down...`);
		isRunning = false;
		stopPgPoolMonitor();
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
	const workerActivity = createWorkerActivityTracker({
		idleAfterMs: IDLE_SELF_KILL_MS,
	});

	for (const {
		queueId,
		queueUrl,
		defaultEnabled,
		visibilityTimeoutSeconds,
	} of [
		{
			queueId: JOB_QUEUE_IDS.primary,
			queueUrl: QUEUE_URL,
			defaultEnabled: true,
		},
		{
			queueId: JOB_QUEUE_IDS.track,
			queueUrl: process.env.TRACK_SQS_QUEUE_URL,
			defaultEnabled: true,
		},
		{
			queueId: JOB_QUEUE_IDS.trackAsync,
			queueUrl: process.env.TRACK_ASYNC_SQS_QUEUE_URL,
			defaultEnabled: true,
		},
		{
			queueId: JOB_QUEUE_IDS.customerCreationRecovery,
			queueUrl: process.env.CUSTOMER_CREATION_RECOVERY_SQS_QUEUE_URL,
			defaultEnabled: false,
		},
		{
			queueId: JOB_QUEUE_IDS.stripeWebhookReplay,
			queueUrl: process.env.STRIPE_WEBHOOK_SQS_QUEUE_URL,
			defaultEnabled: false,
		},
		{
			queueId: JOB_QUEUE_IDS.batchReset,
			queueUrl: process.env.BATCH_RESET_SQS_QUEUE_URL,
			defaultEnabled: true,
			// Comfortably above BATCH_RESET_MESSAGE_TIMEOUT_MS so a redelivery can
			// never overlap live processing, and low enough that a wedged handler
			// frees its message in minutes — the scan gates block on in-flight
			// depth, so a long window stalls the whole sweep.
			visibilityTimeoutSeconds: 900,
		},
	]) {
		if (!queueUrl) continue;

		pollingLoops.push(
			startPollingLoop({
				db,
				queueId,
				queueUrl,
				isFifo: queueUrl.endsWith(".fifo"),
				getSqsClientFn: () => getSqsClient({ queueUrl }),
				recreateSqsClientFn: () => recreateSqsClient({ queueUrl }),
				shouldPoll: () =>
					isJobQueueEnabled({ queue: queueId, defaultEnabled }) &&
					isActiveSlot({ serviceName: "workers" }),
				visibilityTimeoutSeconds,
				workerActivity,
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
