import { SQSClient } from "@aws-sdk/client-sqs";
import { startPollingLoop } from "@/queue/initWorkers.js";

const queueUrl = process.env.TEST_QUEUE_URL;
const endpoint = process.env.TEST_SQS_ENDPOINT;
const shouldPoll = process.env.TEST_SHOULD_POLL === "true";

if (!queueUrl || !endpoint) {
	throw new Error("TEST_QUEUE_URL and TEST_SQS_ENDPOINT are required");
}

const createClient = () =>
	new SQSClient({
		region: "us-east-1",
		endpoint,
		credentials: {
			accessKeyId: "x",
			secretAccessKey: "x",
		},
	});

let client = createClient();

await startPollingLoop({
	db: {} as never,
	queueUrl,
	isFifo: queueUrl.endsWith(".fifo"),
	getSqsClientFn: () => client,
	recreateSqsClientFn: () => {
		client.destroy();
		client = createClient();
		return client;
	},
	shouldPoll: () => shouldPoll,
});
