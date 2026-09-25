import { afterAll, expect, mock, test } from "bun:test";
import {
	DeleteMessageBatchCommand,
	type Message,
	ReceiveMessageCommand,
	SendMessageBatchCommand,
	type SendMessageCommand,
} from "@aws-sdk/client-sqs";
import { JobName } from "@/queue/JobName.js";

const realSqs = { ...(await import("@/queue/initSqs.js")) };
const realProcessor = { ...(await import("@/queue/processMessage.js")) };
const sent: Array<{
	QueueUrl?: string;
	MessageGroupId?: string;
	MessageDeduplicationId?: string;
}> = [];
mock.module("@/queue/initSqs.js", () => ({
	...realSqs,
	getSqsClient: () => ({
		send: async (command: SendMessageCommand | SendMessageBatchCommand) => {
			sent.push(command.input);
			return command instanceof SendMessageBatchCommand
				? { Successful: command.input.Entries?.map(({ Id }) => ({ Id })) }
				: { MessageId: "queued" };
		},
	}),
}));
const stripeStarted = Promise.withResolvers<void>();
const releaseStripe = Promise.withResolvers<void>();
const syncFinished = Promise.withResolvers<void>();
mock.module("@/queue/processMessage.js", () => ({
	...realProcessor,
	processMessage: async ({ message }: { message: Message }) => {
		if (
			JSON.parse(message.Body ?? "{}").name === JobName.StoreInvoiceLineItems
		) {
			stripeStarted.resolve();
			await releaseStripe.promise;
		} else syncFinished.resolve();
	},
}));
const { addTaskToQueue } = await import("@/queue/queueUtils.js");
const { startPollingLoop } = await import("@/queue/initWorkers.js");

afterAll(() => {
	mock.module("@/queue/initSqs.js", () => realSqs);
	mock.module("@/queue/processMessage.js", () => realProcessor);
});

test("sync routing is opt-in and preserves FIFO identifiers and explicit destinations", async () => {
	const originalPrimary = process.env.SQS_QUEUE_URL_V2;
	const originalSync = process.env.BALANCE_SYNC_SQS_QUEUE_URL;
	const primary = "http://localhost:9324/000000000000/primary.fifo";
	const sync = "http://localhost:9324/000000000000/sync.fifo";
	process.env.SQS_QUEUE_URL_V2 = primary;
	try {
		delete process.env.BALANCE_SYNC_SQS_QUEUE_URL;
		await addTaskToQueue({
			jobName: JobName.SyncBalanceBatchV4,
			payload: {} as never,
		});
		expect(sent[sent.length - 1]?.QueueUrl).toBe(primary);
		process.env.BALANCE_SYNC_SQS_QUEUE_URL = sync;
		for (const jobName of [
			JobName.SyncBalanceBatchV4,
			JobName.SyncCustomerDirty,
		]) {
			await addTaskToQueue({
				jobName,
				payload: {} as never,
				messageGroupId: "customer-group",
				messageDeduplicationId: "dedup",
			});
			expect(sent[sent.length - 1]).toMatchObject({
				QueueUrl: sync,
				MessageGroupId: "customer-group",
				MessageDeduplicationId: "dedup",
			});
		}
		await addTaskToQueue({
			jobName: JobName.StoreInvoiceLineItems,
			payload: {},
		});
		expect(sent[sent.length - 1]?.QueueUrl).toBe(primary);
		await addTaskToQueue({
			jobName: JobName.SyncBalanceBatchV4,
			payload: {} as never,
			queueUrl: primary,
		});
		expect(sent[sent.length - 1]?.QueueUrl).toBe(primary);
	} finally {
		if (originalPrimary === undefined) delete process.env.SQS_QUEUE_URL_V2;
		else process.env.SQS_QUEUE_URL_V2 = originalPrimary;
		if (originalSync === undefined)
			delete process.env.BALANCE_SYNC_SQS_QUEUE_URL;
		else process.env.BALANCE_SYNC_SQS_QUEUE_URL = originalSync;
	}
});

const startQueue = ({
	jobName,
	queueId,
}: {
	jobName: JobName;
	queueId: string;
}) => {
	let received = false;
	const sqs = {
		send: async (command: unknown) => {
			if (command instanceof DeleteMessageBatchCommand)
				return { Successful: command.input.Entries };
			if (command instanceof ReceiveMessageCommand && !received) {
				received = true;
				return {
					Messages: [
						{
							MessageId: queueId,
							ReceiptHandle: queueId,
							Body: JSON.stringify({ name: jobName, data: {} }),
						},
					],
				};
			}
			throw new DOMException("finished", "AbortError");
		},
	};
	return startPollingLoop({
		db: {} as never,
		queueId,
		queueUrl: `http://localhost/${queueId}.fifo`,
		isFifo: true,
		getSqsClientFn: () => sqs as never,
		recreateSqsClientFn: () => sqs as never,
		shouldPoll: () => true,
	});
};

test("the sync consumer progresses while the primary consumer waits for Stripe", async () => {
	let primaryFinished = false;
	const primary = startQueue({
		jobName: JobName.StoreInvoiceLineItems,
		queueId: "primary",
	}).then(() => {
		primaryFinished = true;
	});
	await stripeStarted.promise;
	const sync = startQueue({
		jobName: JobName.SyncBalanceBatchV4,
		queueId: "balanceSync",
	});
	try {
		await syncFinished.promise;
		expect(primaryFinished).toBe(false);
		await sync;
		expect(primaryFinished).toBe(false);
	} finally {
		releaseStripe.resolve();
		await primary;
	}
});
