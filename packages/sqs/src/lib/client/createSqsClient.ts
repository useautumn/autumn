import { SQSClient } from "@aws-sdk/client-sqs";
import { queueUrlToLocalEndpoint, queueUrlToRegion } from "./queueUrl.js";
import type { SqsClient, SqsClientConfig } from "./types/sqsClient.js";

export const createSqsClient = ({
	config,
}: {
	config: SqsClientConfig;
}): SqsClient => {
	const client = new SQSClient({
		region: config.region,
		...(config.endpoint && { endpoint: config.endpoint }),
		...(config.credentials && { credentials: config.credentials }),
	});
	return {
		client,
		isLocalEndpoint: config.endpoint !== undefined,
		close: () => client.destroy(),
	};
};

/** An emulator never checks signatures, but the SDK refuses to send unsigned when no provider resolves keys. */
const EMULATOR_CREDENTIALS = { accessKeyId: "", secretAccessKey: "" };

/** The client config a queue URL implies: its region on AWS, or the emulator it points at. */
export const sqsClientConfigForQueue = ({
	queueUrl,
	defaultRegion,
	credentials,
}: {
	queueUrl: string;
	defaultRegion: string;
	credentials?: SqsClientConfig["credentials"];
}): SqsClientConfig => {
	const endpoint = queueUrlToLocalEndpoint({ queueUrl });
	return {
		region: queueUrlToRegion({ queueUrl }) ?? defaultRegion,
		endpoint,
		credentials: credentials ?? (endpoint ? EMULATOR_CREDENTIALS : undefined),
	};
};
