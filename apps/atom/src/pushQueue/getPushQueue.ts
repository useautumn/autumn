import type { AtomEnv } from "@autumn/env/atom";
import { createBindingPushQueue } from "./binding/createBindingPushQueue.js";
import { createSdkPushQueue } from "./sdk/createSdkPushQueue.js";
import { createSqsClient } from "./sdk/createSqsClient.js";
import type { PushQueue } from "./types/pushQueue.js";

let pushQueue: PushQueue | undefined;

/** One per receiving thread: module state is the thread's own. */
export const getPushQueue = ({ env }: { env: AtomEnv }): PushQueue => {
	pushQueue ??= createPushQueue({ queueUrl: env.ATOM_SDK_PUSH_QUEUE_URL });
	return pushQueue;
};

const createPushQueue = ({ queueUrl }: { queueUrl: string | null }) => {
	if (!queueUrl) return createBindingPushQueue();
	return createSdkPushQueue({
		ctx: { sqs: createSqsClient({ queueUrl }), queueUrl },
	});
};
