import { SQSClient } from "@aws-sdk/client-sqs";

const AWS_QUEUE_URL = /^https:\/\/sqs\.([a-z0-9-]+)\.amazonaws\.com\//;
const DEFAULT_REGION = "us-east-1";
const EMULATOR_CREDENTIALS = { accessKeyId: "", secretAccessKey: "" };

const emulatorEndpointOf = ({ queueUrl }: { queueUrl: string }) => {
	try {
		const url = new URL(queueUrl);
		if (url.hostname.endsWith("amazonaws.com")) return null;
		return `${url.protocol}//${url.host}`;
	} catch {
		return null;
	}
};

export const createSqsClient = ({
	queueUrl,
}: {
	queueUrl: string;
}): SQSClient => {
	const region = queueUrl.match(AWS_QUEUE_URL)?.[1] ?? DEFAULT_REGION;
	const endpoint = emulatorEndpointOf({ queueUrl });
	if (!endpoint) return new SQSClient({ region });
	return new SQSClient({
		region,
		endpoint,
		credentials: EMULATOR_CREDENTIALS,
	});
};
