import { queue } from "@alienplatform/bindings";
import { MAX_PUSHES_PER_PULL } from "../sqsLimits.js";
import type { PushQueue } from "../types/pushQueue.js";

/** The queue `packages/alien/stacks/byoc/alien.json` links to Atom. */
const PUSH_QUEUE = "pushes";

/** The reader for a non-SQS queue, or ATOM_PUSH_QUEUE_CLIENT=binding: the Alien binding's own client. Its receive cannot be aborted, so stop waits out the poll in flight. */
export const createBindingPushQueue = (): PushQueue => {
	const pushes = queue(PUSH_QUEUE);
	return {
		pull: () => pushes.receive(MAX_PUSHES_PER_PULL),
		ack: (receiptHandle) => pushes.ack(receiptHandle),
	};
};
