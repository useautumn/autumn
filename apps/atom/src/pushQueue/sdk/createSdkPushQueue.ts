import {
	DeleteMessageCommand,
	type Message,
	ReceiveMessageCommand,
} from "@aws-sdk/client-sqs";
import {
	LONG_POLL_SECONDS,
	MAX_PUSHES_PER_PULL,
	RECEIVE_TIMEOUT_MS,
} from "../sqsLimits.js";
import type { PulledPush, PushQueue } from "../types/pushQueue.js";
import type { SqsClient } from "./types/sqsClient.js";

type SdkPushQueueContext = { sqs: SqsClient; queueUrl: string };

const messageToPulledPush = (message: Message): PulledPush => ({
	payload: message.Body ?? "",
	receiptHandle: message.ReceiptHandle ?? "",
	attempt: Number(message.Attributes?.ApproximateReceiveCount ?? 1),
});

const pullPushes = async ({
	ctx,
	signal,
}: {
	ctx: SdkPushQueueContext;
	signal: AbortSignal;
}): Promise<PulledPush[]> => {
	const { Messages = [] } = await ctx.sqs.send(
		new ReceiveMessageCommand({
			QueueUrl: ctx.queueUrl,
			MaxNumberOfMessages: MAX_PUSHES_PER_PULL,
			WaitTimeSeconds: LONG_POLL_SECONDS,
			MessageSystemAttributeNames: ["ApproximateReceiveCount"],
		}),
		{ abortSignal: signal, requestTimeout: RECEIVE_TIMEOUT_MS },
	);
	return Messages.map(messageToPulledPush);
};

const ackPush = async ({
	ctx,
	receiptHandle,
}: {
	ctx: SdkPushQueueContext;
	receiptHandle: string;
}): Promise<void> => {
	await ctx.sqs.send(
		new DeleteMessageCommand({
			QueueUrl: ctx.queueUrl,
			ReceiptHandle: receiptHandle,
		}),
	);
};

/** The opt-in reader (ATOM_PUSH_QUEUE_CLIENT=sdk): the AWS SDK at the URL the Alien binding names; a receive can be aborted. */
export const createSdkPushQueue = ({
	ctx,
}: {
	ctx: SdkPushQueueContext;
}): PushQueue => ({
	pull: ({ signal }) => pullPushes({ ctx, signal }),
	ack: (receiptHandle) => ackPush({ ctx, receiptHandle }),
});
