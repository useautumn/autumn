import { SQSClient } from "@aws-sdk/client-sqs";
import {
	DEFAULT_AWS_REGION,
	extractRegionFromQueueUrl,
} from "@/external/aws/awsRegionUtils.js";

// ============ FIFO Queue (primary) ============

const getSqsClientConfig = () => ({
	region:
		extractRegionFromQueueUrl({
			queueUrl: process.env.SQS_QUEUE_URL,
		}) || DEFAULT_AWS_REGION,
	credentials: {
		accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
		secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
	},
});

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

export const QUEUE_URL = process.env.SQS_QUEUE_URL || "";
