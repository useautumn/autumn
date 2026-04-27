import { SQSClient } from "@aws-sdk/client-sqs";
import {
	DEFAULT_AWS_REGION,
	extractRegionFromQueueUrl,
} from "@/external/aws/awsRegionUtils.js";

// ============ FIFO Queue (primary) ============

/** Returns a base endpoint URL if the queue URL points to a non-AWS host (e.g. ElasticMQ). */
export const extractLocalEndpoint = ({
	queueUrl,
}: {
	queueUrl: string | undefined;
}): string | undefined => {
	if (!queueUrl) return undefined;
	try {
		const url = new URL(queueUrl);
		if (url.hostname.endsWith("amazonaws.com")) return undefined;
		return `${url.protocol}//${url.host}`;
	} catch {
		return undefined;
	}
};

const getSqsClientConfig = () => {
	const queueUrl = process.env.SQS_QUEUE_URL_V2;
	const endpoint = extractLocalEndpoint({ queueUrl });
	return {
		region:
			extractRegionFromQueueUrl({ queueUrl }) || DEFAULT_AWS_REGION,
		...(endpoint ? { endpoint } : {}),
		credentials: {
			accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
			secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
		},
	};
};

let sqsClient = new SQSClient(getSqsClientConfig());

export const sqs = sqsClient;

/** Recreates the SQS client with fresh connections */
export const recreateSqsClient = (): SQSClient => {
	console.log(`[SQS] Recreating SQS client (stale connection suspected)`);
	sqsClient.destroy();
	sqsClient = new SQSClient(getSqsClientConfig());
	return sqsClient;
};

/** Get the current SQS client (use this instead of direct sqs export for refreshable access) */
export const getSqsClient = (): SQSClient => sqsClient;

export const QUEUE_URL = process.env.SQS_QUEUE_URL_V2 || "";
