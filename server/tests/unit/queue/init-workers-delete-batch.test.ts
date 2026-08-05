import { afterAll, describe, expect, mock, test } from "bun:test";
import {
	DeleteMessageBatchCommand,
	type Message,
	ReceiveMessageCommand,
} from "@aws-sdk/client-sqs";

// Snapshot (not the live namespace — its bindings retarget to the mock) so
// afterAll can put the real module back for later files in this process.
const realProcessMessage = { ...(await import("@/queue/processMessage.js")) };

mock.module("@/queue/processMessage.js", () => ({
	...realProcessMessage,
	processMessage: mock(async () => {}),
}));

const { startPollingLoop } = await import("@/queue/initWorkers.js");

afterAll(() => {
	mock.module("@/queue/processMessage.js", () => realProcessMessage);
});

const makeAbortError = () => {
	const error = new Error("aborted") as Error & { name: string };
	error.name = "AbortError";
	return error;
};

/**
 * A partial DeleteMessageBatch failure used to be ignored, so its successful job was redelivered.
 * The worker must retry only failed acknowledgements and leave successful deletions alone.
 */
describe("SQS batch acknowledgement", () => {
	test("retries only entries that SQS failed to delete", async () => {
		const messages: Message[] = [
			{
				MessageId: "message-1",
				ReceiptHandle: "receipt-1",
				Body: JSON.stringify({ name: "test-job", data: {} }),
			},
			{
				MessageId: "message-2",
				ReceiptHandle: "receipt-2",
				Body: JSON.stringify({ name: "test-job", data: {} }),
			},
		];
		const deletedEntryBatches: Array<
			Array<{ Id?: string; ReceiptHandle?: string }>
		> = [];
		let receiveCalls = 0;

		const sqs = {
			send: async (command: unknown) => {
				if (command instanceof ReceiveMessageCommand) {
					receiveCalls++;
					if (receiveCalls === 1) return { Messages: messages };
					throw makeAbortError();
				}

				if (command instanceof DeleteMessageBatchCommand) {
					deletedEntryBatches.push(command.input.Entries ?? []);
					if (deletedEntryBatches.length === 1) {
						return {
							Successful: [{ Id: "message-1" }],
							Failed: [
								{
									Id: "message-2",
									Code: "InternalError",
									SenderFault: false,
								},
							],
						};
					}
					return { Successful: [{ Id: "message-2" }], Failed: [] };
				}

				throw new Error("Unexpected SQS command");
			},
		};

		await startPollingLoop({
			db: {} as never,
			queueId: "primary",
			queueUrl: "https://sqs.eu-west-1.amazonaws.com/123/primary.fifo",
			isFifo: true,
			getSqsClientFn: () => sqs as never,
			recreateSqsClientFn: () => sqs as never,
			shouldPoll: () => true,
		});

		expect(deletedEntryBatches).toEqual([
			[
				{ Id: "message-1", ReceiptHandle: "receipt-1" },
				{ Id: "message-2", ReceiptHandle: "receipt-2" },
			],
			[{ Id: "message-2", ReceiptHandle: "receipt-2" }],
		]);
	});

	test("stops after four failed deletion attempts", async () => {
		let deleteCalls = 0;
		let receiveCalls = 0;
		const sqs = {
			send: async (command: unknown) => {
				if (command instanceof ReceiveMessageCommand) {
					receiveCalls++;
					if (receiveCalls === 1) {
						return {
							Messages: [
								{
									MessageId: "message-1",
									ReceiptHandle: "receipt-1",
									Body: JSON.stringify({ name: "test-job", data: {} }),
								},
							],
						};
					}
					throw makeAbortError();
				}

				if (command instanceof DeleteMessageBatchCommand) {
					deleteCalls++;
					return {
						Failed: [
							{
								Id: "message-1",
								Code: "InternalError",
								SenderFault: false,
							},
						],
					};
				}

				throw new Error("Unexpected SQS command");
			},
		};

		await startPollingLoop({
			db: {} as never,
			queueId: "primary",
			queueUrl: "https://sqs.eu-west-1.amazonaws.com/123/primary.fifo",
			isFifo: true,
			getSqsClientFn: () => sqs as never,
			recreateSqsClientFn: () => sqs as never,
			shouldPoll: () => true,
		});

		expect(deleteCalls).toBe(4);
	});
});
