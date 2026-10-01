import { type QueueMessage, queue } from "@alienplatform/bindings";
import type { AutumnLogger } from "@autumn/logging";
import {
	PushType,
	queuePayloadToPushMessage,
} from "../lib/contracts/pushMessageContract.js";
import type { Slots } from "../slots/types/slots.js";
import { applyCatalogPush, applySubjectPush } from "./applyPushes.js";
import type { PushReceiver } from "./types/pushReceiver.js";

/** The queue `packages/alien/stacks/byoc/alien.json` links to Atom. */
const PUSH_QUEUE = "pushes";
/** SQS's most per receive. */
const RECEIVE_BATCH = 10;

type PushReceiverContext = {
	slots: Slots;
	logger: Pick<AutumnLogger, "warn">;
};

const applyPushMessage = ({
	ctx,
	message,
}: {
	ctx: PushReceiverContext;
	message: QueueMessage;
}): void => {
	const { type, body } = queuePayloadToPushMessage({
		payload: message.payload,
	});
	if (type === PushType.SetSubject)
		applySubjectPush({ slots: ctx.slots, body });
	else applyCatalogPush({ slots: ctx.slots, body });
};

/** An applied push is acked; one that failed is left for SQS to deliver again, and the next is tried. */
const receivePushes = async ({
	ctx,
	messages,
	ack,
}: {
	ctx: PushReceiverContext;
	messages: QueueMessage[];
	ack: (receipt: string) => Promise<void>;
}): Promise<void> => {
	for (const message of messages) {
		try {
			applyPushMessage({ ctx, message });
			await ack(message.receiptHandle);
		} catch (error) {
			ctx.logger.warn(
				{ error, type: "atom_push_failed", data: { attempt: message.attempt } },
				"A queued push was not applied; SQS will deliver it again",
			);
		}
	}
};

/** Autumn's pushes read from the org's own queue, so nothing has to reach Atom from outside. */
export const createPushReceiver = ({
	ctx,
}: {
	ctx: PushReceiverContext;
}): PushReceiver => {
	const pushes = queue(PUSH_QUEUE);
	let stopping = false;

	async function run(): Promise<void> {
		while (!stopping) {
			const messages = await pushes.receive(RECEIVE_BATCH);
			await receivePushes({
				ctx,
				messages,
				ack: (receipt) => pushes.ack(receipt),
			});
		}
	}

	return {
		run,
		stop: () => {
			stopping = true;
		},
	};
};
