import { queue } from "@alienplatform/bindings";
import { MAX_PUSHES_PER_PULL } from "../sqsLimits.js";
import type { PushQueue } from "../types/pushQueue.js";

/** The queue `packages/alien/stacks/byoc/alien.json` links to Atom. */
const PUSH_QUEUE = "pushes";

/** The fallback reader (ATOM_PUSH_QUEUE_CLIENT=binding): the Alien binding's own SQS client. */
export const createAlienPushQueue = (): PushQueue => {
	const pushes = queue(PUSH_QUEUE);
	return {
		pull: () => pushes.receive(MAX_PUSHES_PER_PULL),
		ack: (receiptHandle) => pushes.ack(receiptHandle),
	};
};
