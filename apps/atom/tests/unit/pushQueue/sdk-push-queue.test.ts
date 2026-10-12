import { describe, expect, test } from "bun:test";
import {
	DeleteMessageBatchCommand,
	ReceiveMessageCommand,
} from "@aws-sdk/client-sqs";
import {
	ACK_LINGER_MS,
	createSdkPushQueue,
	PushAckError,
} from "../../../src/pushQueue/sdk/createSdkPushQueue.js";

const QUEUE_URL = "https://sqs.us-east-1.amazonaws.com/123456789012/pushes";

/** Records each command, answers receives with the given messages and fails the delete entries named. */
const fakeSqs = ({
	messages,
	failedIds = [],
}: {
	messages: object[];
	failedIds?: string[];
}) => {
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
					: {
							Failed: failedIds.map((Id) => ({
								Id,
								Code: "ReceiptHandleIsInvalid",
								SenderFault: true,
							})),
						};
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

	test("acks share one delete: a full batch goes at once, by receipt handle", async () => {
		const { sqs, sent } = fakeSqs({ messages: [] });
		const pushQueue = createSdkPushQueue({ ctx: { sqs, queueUrl: QUEUE_URL } });

		await Promise.all(
			Array.from({ length: 10 }, (_, index) =>
				pushQueue.ack(`receipt_${index}`),
			),
		);

		expect(sent).toHaveLength(1);
		expect(sent[0]).toBeInstanceOf(DeleteMessageBatchCommand);
		expect((sent[0] as DeleteMessageBatchCommand).input).toEqual({
			QueueUrl: QUEUE_URL,
			Entries: Array.from({ length: 10 }, (_, index) => ({
				Id: String(index),
				ReceiptHandle: `receipt_${index}`,
			})),
		});
	});

	test("a lone ack is deleted once the linger passes", async () => {
		const { sqs, sent } = fakeSqs({ messages: [] });
		const pushQueue = createSdkPushQueue({ ctx: { sqs, queueUrl: QUEUE_URL } });

		const startedAt = performance.now();
		await pushQueue.ack("receipt_1");

		expect(performance.now() - startedAt).toBeGreaterThanOrEqual(
			ACK_LINGER_MS - 1,
		);
		expect((sent[0] as DeleteMessageBatchCommand).input.Entries).toEqual([
			{ Id: "0", ReceiptHandle: "receipt_1" },
		]);
	});

	test("an entry SQS refuses fails only its own ack, so only that push is delivered again", async () => {
		const { sqs } = fakeSqs({ messages: [], failedIds: ["1"] });
		const pushQueue = createSdkPushQueue({ ctx: { sqs, queueUrl: QUEUE_URL } });

		const acks = await Promise.allSettled([
			pushQueue.ack("receipt_0"),
			pushQueue.ack("receipt_1"),
			pushQueue.ack("receipt_2"),
		]);

		expect(acks.map((ack) => ack.status)).toEqual([
			"fulfilled",
			"rejected",
			"fulfilled",
		]);
		expect((acks[1] as PromiseRejectedResult).reason).toBeInstanceOf(
			PushAckError,
		);
	});

	test("a delete that fails fails every ack in it", async () => {
		const pushQueue = createSdkPushQueue({
			ctx: {
				sqs: {
					send: async () => {
						throw new Error("network down");
					},
				} as never,
				queueUrl: QUEUE_URL,
			},
		});

		const acks = await Promise.allSettled([
			pushQueue.ack("receipt_0"),
			pushQueue.ack("receipt_1"),
		]);

		expect(acks.map((ack) => ack.status)).toEqual(["rejected", "rejected"]);
	});
});
