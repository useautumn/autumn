import { mock } from "bun:test";
import { ReceiveMessageCommand } from "@aws-sdk/client-sqs";

process.env.SQS_QUEUE_URL_V2 =
	"https://sqs.us-east-2.amazonaws.com/123/primary.fifo";

const mockPartial = async (
	path: string,
	overrides: Record<string, unknown>,
) => {
	const real = await import(path);
	mock.module(path, () => ({ ...real, ...overrides }));
};

const makeAbortError = () => {
	const error = new Error("aborted");
	error.name = "AbortError";
	return error;
};

let receiveCalls = 0;
const sqs = {
	send: (command: unknown, options?: { abortSignal?: AbortSignal }) => {
		if (!(command instanceof ReceiveMessageCommand)) {
			return Promise.resolve({ Successful: [] });
		}
		receiveCalls++;
		if (receiveCalls === 1) {
			console.log("JOB_RECEIVED");
			return Promise.resolve({
				Messages: [
					{
						MessageId: "message-1",
						ReceiptHandle: "receipt-1",
						Body: JSON.stringify({ name: "track", data: {} }),
					},
				],
			});
		}
		return new Promise((_, reject) => {
			options?.abortSignal?.addEventListener(
				"abort",
				() => reject(makeAbortError()),
				{ once: true },
			);
		});
	},
};

await mockPartial("@/queue/initSqs.js", {
	getSqsClient: () => sqs,
	recreateSqsClient: () => sqs,
});
await mockPartial("@/queue/utils/sendSqsMessages.js", {
	sendSqsMessagesBatch: async ({
		entries,
	}: {
		entries: Array<{ jobName: string; messageBody: string }>;
	}) => {
		for (const entry of entries) {
			const events = JSON.parse(entry.messageBody).data.events ?? [];
			console.log(`SQS_SENT ${entry.jobName} events=${events.length}`);
		}
		return { successCount: entries.length, failures: [] };
	},
});
await mockPartial("@/external/tinybird/sendEvents/sendEvents.js", {
	sendEventsToTinybird: async ({ events }: { events: unknown[] }) => {
		console.log(`TINYBIRD_SENT events=${events.length}`);
	},
});
await mockPartial("@/db/initDrizzle.js", { initDrizzle: () => ({ db: {} }) });
await mockPartial("@/db/pgPoolMonitor.js", {
	startPgPoolMonitor: () => {},
	stopPgPoolMonitor: () => {},
});
await mockPartial("@/queue/blueGreen/initBlueGreen.js", {
	initBlueGreen: async () => {},
	shutdownBlueGreen: () => {},
});
await mockPartial("@/queue/blueGreen/blueGreenGate.js", {
	isActiveSlot: () => true,
});
await mockPartial("@/internal/misc/jobQueues/jobQueueStore.js", {
	isJobQueueEnabled: () => true,
});
await mockPartial(
	"@/external/redis/actions/queueCapacityLease/queueCapacityLease.js",
	{
		reserveQueueCapacity: async () => ({
			capacity: 10,
			isLimited: false,
			assign: async (messages: unknown[]) =>
				messages.map((item) => ({ item, release: async () => {} })),
			release: async () => {},
		}),
	},
);

const { globalEventBatchingManager } = await import(
	"@/internal/balances/events/EventBatchingManager.js"
);

await mockPartial("@/queue/processMessage.js", {
	processMessage: async () => {
		process.kill(process.pid, "SIGTERM");
		await new Promise((resolve) => setTimeout(resolve, 200));
		globalEventBatchingManager.addEvent({
			id: "evt_shutdown_flush",
		} as never);
		console.log("JOB_FINISHED");
	},
});

process.on("unhandledRejection", (reason) => {
	console.log(`UNHANDLED_REJECTION ${(reason as Error)?.name}`);
});

const { initWorkers } = await import("@/queue/initWorkers.js");

await initWorkers({ startupStartedAt: Date.now(), queueImplementation: "sqs" });
