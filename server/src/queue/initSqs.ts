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

const getSqsClientConfig = ({ queueUrl }: { queueUrl?: string } = {}) => {
	const resolvedQueueUrl = queueUrl ?? process.env.SQS_QUEUE_URL_V2;
	const endpoint = extractLocalEndpoint({ queueUrl: resolvedQueueUrl });
	const region =
		extractRegionFromQueueUrl({ queueUrl: resolvedQueueUrl }) ||
		DEFAULT_AWS_REGION;

	return {
		region,
		...(endpoint ? { endpoint } : {}),
		credentials: {
			accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
			secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
		},
	};
};

const getSqsClientCacheKey = ({ queueUrl }: { queueUrl?: string } = {}) => {
	const resolvedQueueUrl = queueUrl ?? process.env.SQS_QUEUE_URL_V2;
	const endpoint = extractLocalEndpoint({ queueUrl: resolvedQueueUrl });
	const region =
		extractRegionFromQueueUrl({ queueUrl: resolvedQueueUrl }) ||
		DEFAULT_AWS_REGION;

	return `${region}:${endpoint ?? "aws"}`;
};

const sqsClientsByCacheKey = new Map<string, SQSClient>();

let sqsClient = new SQSClient(getSqsClientConfig());
sqsClientsByCacheKey.set(getSqsClientCacheKey(), sqsClient);

export const sqs = sqsClient;

/** Recreates the SQS client with fresh connections */
export const recreateSqsClient = ({
	queueUrl,
}: {
	queueUrl?: string;
} = {}): SQSClient => {
	console.log(`[SQS] Recreating SQS client (stale connection suspected)`);
	const cacheKey = getSqsClientCacheKey({ queueUrl });
	const existingClient = sqsClientsByCacheKey.get(cacheKey);
	existingClient?.destroy();

	const nextClient = new SQSClient(getSqsClientConfig({ queueUrl }));
	sqsClientsByCacheKey.set(cacheKey, nextClient);

	if (!queueUrl || queueUrl === process.env.SQS_QUEUE_URL_V2) {
		sqsClient = nextClient;
	}

	return nextClient;
};

/** Get the current SQS client (use this instead of direct sqs export for refreshable access) */
export const getSqsClient = ({
	queueUrl,
}: {
	queueUrl?: string;
} = {}): SQSClient => {
	const cacheKey = getSqsClientCacheKey({ queueUrl });
	const existingClient = sqsClientsByCacheKey.get(cacheKey);
	if (existingClient) return existingClient;

	const nextClient = new SQSClient(getSqsClientConfig({ queueUrl }));
	sqsClientsByCacheKey.set(cacheKey, nextClient);
	return nextClient;
};

export const QUEUE_URL = process.env.SQS_QUEUE_URL_V2 || "";
