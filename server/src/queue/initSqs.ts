import { SQSClient } from "@aws-sdk/client-sqs";

const DEFAULT_AWS_REGION = "us-west-2";

/**
 * Extracts the AWS region from a given SQS queue URL.
 * Returns undefined if the URL is empty or invalid.
 */
export function extractRegionFromQueueUrl({
	queueUrl,
}: {
	queueUrl: string | undefined;
}): string | undefined {
	if (!queueUrl) return undefined;
	// SQS URL format: https://sqs.<region>.amazonaws.com/<account>/<queueName>
	const match = queueUrl.match(
		/^https:\/\/sqs\.([a-z0-9-]+)\.amazonaws\.com\//,
	);
	return match ? match[1] : undefined;
}

export const sqs = new SQSClient({
	region:
		extractRegionFromQueueUrl({
			queueUrl: process.env.SQS_QUEUE_URL,
		}) || DEFAULT_AWS_REGION,
	credentials: {
		accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
		secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
	},
});
// SQS Queue URL - you'll need to create this queue in AWS console or via terraform
export const QUEUE_URL = process.env.SQS_QUEUE_URL || "";
