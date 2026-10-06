import { describe, expect, test } from "bun:test";
import {
	DeleteMessageCommand,
	ReceiveMessageCommand,
} from "@aws-sdk/client-sqs";
import { createSdkPushQueue } from "../../../src/pushes/createSdkPushQueue.js";

const QUEUE_URL = "https://sqs.us-east-1.amazonaws.com/123456789012/pushes";

/** Records each command and answers receives with the given messages. */
const fakeSqs = ({ messages }: { messages: object[] }) => {
	const sent: unknown[] = [];
	return {
		sent,
		sqs: {
			send: async (command: unknown) => {
				sent.push(command);
				return command instanceof ReceiveMessageCommand
					? { Messages: messages }
					: {};
			},
		} as never,
	};
};

describe("sdk push queue", () => {
	test("a receive long-polls the binding's queue and reads each message as the binding would", async () => {
		const { sqs, sent } = fakeSqs({
			messages: [
				{
					Body: '{"type":"set_subject"}',
					ReceiptHandle: "receipt_1",
					Attributes: { ApproximateReceiveCount: "3" },
				},
			],
		});

		const received = await createSdkPushQueue({
			ctx: { sqs },
			queueUrl: QUEUE_URL,
		}).receive(10);

		expect(received).toEqual([
			{
				payloadType: "text",
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
	});

	test("an ack deletes the message by its receipt handle", async () => {
		const { sqs, sent } = fakeSqs({ messages: [] });

		await createSdkPushQueue({ ctx: { sqs }, queueUrl: QUEUE_URL }).ack(
			"receipt_1",
		);

		expect(sent[0]).toBeInstanceOf(DeleteMessageCommand);
		expect((sent[0] as DeleteMessageCommand).input).toEqual({
			QueueUrl: QUEUE_URL,
			ReceiptHandle: "receipt_1",
		});
	});
});
