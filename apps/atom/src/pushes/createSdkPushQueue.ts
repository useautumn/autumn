import type { Queue, QueueMessage } from "@alienplatform/bindings";
import {
	createSqsClient,
	type SqsExecutor,
	sqsClientConfigForQueue,
} from "@autumn/sqs";
import {
	DeleteMessageCommand,
	ReceiveMessageCommand,
} from "@aws-sdk/client-sqs";

/** SQS's longest long poll, as the binding asks for. */
const WAIT_TIME_SECONDS = 20;

/** The pushes queue read with the AWS SDK and the workload's role, in place of the binding's own client. */
export const createSdkPushQueue = ({
	ctx,
	queueUrl,
}: {
	ctx: { sqs: SqsExecutor };
	queueUrl: string;
}): Pick<Queue, "receive" | "ack"> => {
	async function receive(max: number): Promise<QueueMessage[]> {
		const { Messages = [] } = await ctx.sqs.send(
			new ReceiveMessageCommand({
				QueueUrl: queueUrl,
				MaxNumberOfMessages: max,
				WaitTimeSeconds: WAIT_TIME_SECONDS,
				MessageSystemAttributeNames: ["ApproximateReceiveCount"],
			}),
		);
		return Messages.map((message) => ({
			payloadType: "text",
			payload: message.Body ?? "",
			receiptHandle: message.ReceiptHandle ?? "",
			attempt: Number(message.Attributes?.ApproximateReceiveCount ?? 1),
		}));
	}

	async function ack(receipt: string): Promise<void> {
		await ctx.sqs.send(
			new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: receipt }),
		);
	}

	return { receive, ack };
};

export const sdkPushQueueFor = ({
	queueUrl,
}: {
	queueUrl: string;
}): Pick<Queue, "receive" | "ack"> =>
	createSdkPushQueue({
		ctx: {
			sqs: createSqsClient({
				config: sqsClientConfigForQueue({
					queueUrl,
					defaultRegion: "us-east-1",
				}),
			}).client,
		},
		queueUrl,
	});
