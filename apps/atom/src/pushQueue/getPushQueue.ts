import type { AtomEnv } from "@autumn/env/atom";
import { createAlienPushQueue } from "./alien/createAlienPushQueue.js";
import { createSqsPushQueue } from "./sqs/createSqsPushQueue.js";
import { getSqsClient } from "./sqs/getSqsClient.js";
import type { PushQueue } from "./types/pushQueue.js";

let pushQueue: PushQueue | undefined;

/** One per receiving thread: module state is the thread's own. */
export const getPushQueue = ({ env }: { env: AtomEnv }): PushQueue => {
	pushQueue ??= createPushQueue({ queueUrl: env.ATOM_SDK_PUSH_QUEUE_URL });
	return pushQueue;
};

const createPushQueue = ({ queueUrl }: { queueUrl: string | null }) => {
	if (!queueUrl) return createAlienPushQueue();
	return createSqsPushQueue({
		ctx: { sqs: getSqsClient({ queueUrl }), queueUrl },
	});
};
