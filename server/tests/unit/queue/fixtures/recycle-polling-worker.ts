import { mock } from "bun:test";
import {
	DeleteMessageBatchCommand,
	ReceiveMessageCommand,
} from "@aws-sdk/client-sqs";

mock.module("@/queue/processMessage.js", () => ({
	processMessage: async () => {},
}));
mock.module(
	"@/external/redis/actions/queueCapacityLease/queueCapacityLease.js",
	() => ({
		reserveQueueCapacity: async () => ({
			capacity: 10,
			isLimited: false,
			assign: async (messages: unknown[]) =>
				messages.map((item) => ({ item, release: async () => {} })),
			release: async () => {},
		}),
	}),
);

const { startPollingLoop } = await import("@/queue/initWorkers.js");

const messages = ["message-1", "message-2"].map((messageId) => ({
	MessageId: messageId,
	ReceiptHandle: `receipt-${messageId}`,
	Body: JSON.stringify({ name: "recycle-test", data: {} }),
}));

let receiveCalls = 0;
const sqs = {
	send: async (command: unknown) => {
		if (command instanceof ReceiveMessageCommand) {
			receiveCalls++;
			if (receiveCalls === 1) return { Messages: messages };
			return new Promise(() => {});
		}

		if (command instanceof DeleteMessageBatchCommand) {
			console.log(`DELETE_BATCH ${command.input.Entries?.length ?? 0}`);
			return {
				Successful: command.input.Entries?.map((entry) => ({ Id: entry.Id })),
			};
		}

		throw new Error("Unexpected SQS command");
	},
};

const pollingOptions = {
	db: {} as never,
	queueId: "primary",
	queueUrl: "https://sqs.test/primary.fifo",
	isFifo: true,
	getSqsClientFn: () => sqs as never,
	recreateSqsClientFn: () => sqs as never,
	shouldPoll: () => true,
	maxMessagesBeforeRecycle: 2,
};

await startPollingLoop(pollingOptions);
