import type { AtomEnv } from "@autumn/env/atom";
import { createSqsClient, sqsClientConfigForQueue } from "@autumn/sqs";
import { createAlienPushQueue } from "./alien/createAlienPushQueue.js";
import { createSqsPushQueue } from "./sqs/createSqsPushQueue.js";
import type { PushQueue } from "./types/pushQueue.js";

let pushQueue: PushQueue | undefined;

/** One per receiving thread: module state is the thread's own. */
export const getPushQueue = ({ env }: { env: AtomEnv }): PushQueue => {
	pushQueue ??= createPushQueue({ queueUrl: env.ATOM_SDK_PUSH_QUEUE_URL });
	return pushQueue;
};

const createPushQueue = ({ queueUrl }: { queueUrl: string | null }) => {
	if (!queueUrl) return createAlienPushQueue();
	const config = sqsClientConfigForQueue({
		queueUrl,
		defaultRegion: "us-east-1",
	});
	return createSqsPushQueue({
		ctx: { sqs: createSqsClient({ config }).client, queueUrl },
	});
};
