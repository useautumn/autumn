import { SQSClient } from "@aws-sdk/client-sqs";
import type { SqsClient } from "./types/sqsClient.js";

const AWS_QUEUE_URL = /^https:\/\/sqs\.([a-z0-9-]+)\.amazonaws\.com\//;
const DEFAULT_REGION = "us-east-1";
/** An emulator never checks signatures, but the SDK refuses to send unsigned when no provider resolves keys. */
const EMULATOR_CREDENTIALS = { accessKeyId: "", secretAccessKey: "" };

let sqsClient: SqsClient | undefined;

/** One per receiving thread, for the queue the Alien binding names; the workload's role signs its calls. */
export const getSqsClient = ({ queueUrl }: { queueUrl: string }): SqsClient => {
	sqsClient ??= createSqsClient({ queueUrl });
	return sqsClient;
};

/** The emulator's base URL when the queue is not on AWS (fakecloud locally); null on AWS. */
const emulatorEndpointOf = ({ queueUrl }: { queueUrl: string }) => {
	try {
		const url = new URL(queueUrl);
		if (url.hostname.endsWith("amazonaws.com")) return null;
		return `${url.protocol}//${url.host}`;
	} catch {
		return null;
	}
};

const createSqsClient = ({ queueUrl }: { queueUrl: string }): SQSClient => {
	const region = queueUrl.match(AWS_QUEUE_URL)?.[1] ?? DEFAULT_REGION;
	const endpoint = emulatorEndpointOf({ queueUrl });
	if (!endpoint) return new SQSClient({ region });
	return new SQSClient({
		region,
		endpoint,
		credentials: EMULATOR_CREDENTIALS,
	});
};
