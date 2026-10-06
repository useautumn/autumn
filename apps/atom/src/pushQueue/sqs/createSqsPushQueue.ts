import {
	DeleteMessageCommand,
	type Message,
	ReceiveMessageCommand,
} from "@aws-sdk/client-sqs";
import { LONG_POLL_SECONDS, MAX_PUSHES_PER_PULL } from "../sqsLimits.js";
import type { PulledPush, PushQueue } from "../types/pushQueue.js";
import type { SqsClient } from "./types/sqsClient.js";

type SqsPushQueueContext = { sqs: SqsClient; queueUrl: string };

const messageToPulledPush = (message: Message): PulledPush => ({
	payload: message.Body ?? "",
	receiptHandle: message.ReceiptHandle ?? "",
	attempt: Number(message.Attributes?.ApproximateReceiveCount ?? 1),
});

const pullPushes = async ({
	ctx,
}: {
	ctx: SqsPushQueueContext;
}): Promise<PulledPush[]> => {
	const { Messages = [] } = await ctx.sqs.send(
		new ReceiveMessageCommand({
			QueueUrl: ctx.queueUrl,
			MaxNumberOfMessages: MAX_PUSHES_PER_PULL,
			WaitTimeSeconds: LONG_POLL_SECONDS,
			MessageSystemAttributeNames: ["ApproximateReceiveCount"],
		}),
	);
	return Messages.map(messageToPulledPush);
};

const ackPush = async ({
	ctx,
	receiptHandle,
}: {
	ctx: SqsPushQueueContext;
	receiptHandle: string;
}): Promise<void> => {
	await ctx.sqs.send(
		new DeleteMessageCommand({
			QueueUrl: ctx.queueUrl,
			ReceiptHandle: receiptHandle,
		}),
	);
};

/** The pushes queue read with the AWS SDK and the workload's role, at the URL the Alien binding names. */
export const createSqsPushQueue = ({
	ctx,
}: {
	ctx: SqsPushQueueContext;
}): PushQueue => ({
	pull: () => pullPushes({ ctx }),
	ack: (receiptHandle) => ackPush({ ctx, receiptHandle }),
});
