import { SQSClient } from "@aws-sdk/client-sqs";
import { FetchHttpHandler } from "@smithy/fetch-http-handler";

const AWS_QUEUE_URL = /^https:\/\/sqs\.([a-z0-9-]+)\.amazonaws\.com\//;
const DEFAULT_REGION = "us-east-1";
/** An emulator never checks signatures, but the SDK refuses to send unsigned when no provider resolves keys. */
const EMULATOR_CREDENTIALS = { accessKeyId: "", secretAccessKey: "" };

/** Bun's native fetch, not its node:http shim: a call costs a fraction of the CPU. keepAlive, or every call opens a new TLS connection. */
const requestHandler = () => new FetchHttpHandler({ keepAlive: true });

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

/** A client for the queue's region; on AWS the workload's role signs its calls. */
export const createSqsClient = ({
	queueUrl,
}: {
	queueUrl: string;
}): SQSClient => {
	const region = queueUrl.match(AWS_QUEUE_URL)?.[1] ?? DEFAULT_REGION;
	const endpoint = emulatorEndpointOf({ queueUrl });
	if (!endpoint)
		return new SQSClient({ region, requestHandler: requestHandler() });
	return new SQSClient({
		region,
		endpoint,
		credentials: EMULATOR_CREDENTIALS,
		requestHandler: requestHandler(),
	});
};
