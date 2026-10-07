import { describe, expect, test } from "bun:test";
import {
	DeleteMessageCommand,
	ReceiveMessageCommand,
} from "@aws-sdk/client-sqs";
import { createSdkPushQueue } from "../../../src/pushQueue/sdk/createSdkPushQueue.js";

const QUEUE_URL = "https://sqs.us-east-1.amazonaws.com/123456789012/pushes";

/** Records each command and answers receives with the given messages. */
const fakeSqs = ({ messages }: { messages: object[] }) => {
	const sent: unknown[] = [];
	const options: unknown[] = [];
	return {
		sent,
		options,
		sqs: {
			send: async (command: unknown, sendOptions: unknown) => {
				sent.push(command);
				options.push(sendOptions);
				return command instanceof ReceiveMessageCommand
					? { Messages: messages }
					: {};
			},
		} as never,
	};
};

describe("SDK push queue", () => {
	test("a pull long-polls the binding's queue for SQS's most per receive, with each message's delivery count, until aborted", async () => {
		const { sqs, sent, options } = fakeSqs({
			messages: [
				{
					Body: '{"type":"set_subject"}',
					ReceiptHandle: "receipt_1",
					Attributes: { ApproximateReceiveCount: "3" },
				},
			],
		});

		const stopped = new AbortController();
		const pulled = await createSdkPushQueue({
			ctx: { sqs, queueUrl: QUEUE_URL },
		}).pull({ signal: stopped.signal });

		expect(pulled).toEqual([
			{
				payload: '{"type":"set_subject"}',
				receiptHandle: "receipt_1",
				attempt: 3,
			},
		]);
		expect((sent[0] as ReceiveMessageCommand).input).toEqual({
			QueueUrl: QUEUE_URL,
			MaxNumberOfMessages: 10,
			WaitTimeSeconds: 20,
			MessageSystemAttributeNames: ["ApproximateReceiveCount"],
		});
		expect(options[0]).toEqual({
			abortSignal: stopped.signal,
			requestTimeout: 25_000,
		});
	});

	test("an ack deletes the message by its receipt handle", async () => {
		const { sqs, sent } = fakeSqs({ messages: [] });

		await createSdkPushQueue({ ctx: { sqs, queueUrl: QUEUE_URL } }).ack(
			"receipt_1",
		);

		expect(sent[0]).toBeInstanceOf(DeleteMessageCommand);
		expect((sent[0] as DeleteMessageCommand).input).toEqual({
			QueueUrl: QUEUE_URL,
			ReceiptHandle: "receipt_1",
		});
	});
});
