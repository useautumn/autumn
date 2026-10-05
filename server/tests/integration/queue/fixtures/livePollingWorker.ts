import { getSqsClient, recreateSqsClient } from "@/queue/initSqs.js";
import { startPollingLoop } from "@/queue/initWorkers.js";

const queueUrl = process.env.TEST_QUEUE_URL;
const shouldPoll = process.env.TEST_SHOULD_POLL === "true";

if (!queueUrl) {
	throw new Error("TEST_QUEUE_URL is required");
}

await startPollingLoop({
	db: {} as never,
	queueId: "primary",
	queueUrl,
	isFifo: queueUrl.endsWith(".fifo"),
	getSqsClientFn: () => getSqsClient({ queueUrl }),
	recreateSqsClientFn: () => recreateSqsClient({ queueUrl }),
	shouldPoll: () => shouldPoll,
});
