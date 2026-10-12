import {
	DeleteMessageBatchCommand,
	type Message,
	ReceiveMessageCommand,
} from "@aws-sdk/client-sqs";
import {
	LONG_POLL_SECONDS,
	MAX_ACKS_PER_DELETE,
	MAX_PUSHES_PER_PULL,
	RECEIVE_TIMEOUT_MS,
} from "../sqsLimits.js";
import type { PulledPush, PushQueue } from "../types/pushQueue.js";
import type { SqsClient } from "./types/sqsClient.js";

/** How long an ack waits for others to share its delete: an SDK call costs far more CPU than the push it acks. */
export const ACK_LINGER_MS = 20;

type SdkPushQueueContext = { sqs: SqsClient; queueUrl: string };

type WaitingAck = ReturnType<typeof Promise.withResolvers<void>> & {
	receiptHandle: string;
};

export class PushAckError extends Error {
	constructor({ code, message }: { code: string; message?: string }) {
		super(
			`SQS did not delete the push: ${code}${message ? ` ${message}` : ""}`,
		);
		this.name = "PushAckError";
	}
}

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

/** One delete for the batch; each ack settles on its own entry, so one SQS refuses fails only that push. */
const deleteAcks = async ({
	ctx,
	acks,
}: {
	ctx: SdkPushQueueContext;
	acks: WaitingAck[];
}): Promise<void> => {
	try {
		const { Failed = [] } = await ctx.sqs.send(
			new DeleteMessageBatchCommand({
				QueueUrl: ctx.queueUrl,
				Entries: acks.map((ack, index) => ({
					Id: String(index),
					ReceiptHandle: ack.receiptHandle,
				})),
			}),
		);
		const failedById = new Map(Failed.map((entry) => [entry.Id, entry]));
		for (const [index, ack] of acks.entries()) {
			const failed = failedById.get(String(index));
			if (failed)
				ack.reject(
					new PushAckError({
						code: failed.Code ?? "unknown",
						message: failed.Message,
					}),
				);
			else ack.resolve();
		}
	} catch (error) {
		for (const ack of acks) ack.reject(error);
	}
};

/** The reader for an SQS queue (ATOM_PUSH_QUEUE_CLIENT auto or sdk): the AWS SDK at the URL the Alien binding names; a receive can be aborted. */
export const createSdkPushQueue = ({
	ctx,
}: {
	ctx: SdkPushQueueContext;
}): PushQueue => {
	let waiting: WaitingAck[] = [];
	let lingering: ReturnType<typeof setTimeout> | null = null;

	function flushAcks(): void {
		if (lingering) clearTimeout(lingering);
		lingering = null;
		const acks = waiting;
		waiting = [];
		void deleteAcks({ ctx, acks });
	}

	/** Settles once its batch is deleted: when MAX_ACKS_PER_DELETE wait, or ACK_LINGER_MS after the first. */
	function ack(receiptHandle: string): Promise<void> {
		const waitingAck = { ...Promise.withResolvers<void>(), receiptHandle };
		waiting.push(waitingAck);
		if (waiting.length >= MAX_ACKS_PER_DELETE) flushAcks();
		else lingering ??= setTimeout(flushAcks, ACK_LINGER_MS);
		return waitingAck.promise;
	}

	return {
		pull: ({ signal }) => pullPushes({ ctx, signal }),
		ack,
	};
};
