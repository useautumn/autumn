import { DEFAULT_AWS_REGION } from "@/external/aws/awsRegionUtils.js";

const AWS_QUEUE_URL_RE =
	/^https:\/\/sqs\.([a-z0-9-]+)\.amazonaws\.com\/(\d+)\/(.+)$/;
const LOCAL_QUEUE_URL_RE = /^https?:\/\/[^/]+\/(\d+)\/(.+)$/;

/**
 * Turns a queue URL into the ARN EventBridge Scheduler targets. A local emulator
 * URL carries no region, so it takes the same default the clients are built with.
 */
export const deriveSqsQueueArn = ({
	queueUrl,
}: {
	queueUrl: string;
}): string => {
	const awsMatch = queueUrl.match(AWS_QUEUE_URL_RE);
	if (awsMatch) {
		const [, region, accountId, queueName] = awsMatch;
		return `arn:aws:sqs:${region}:${accountId}:${queueName}`;
	}

	const localMatch = queueUrl.match(LOCAL_QUEUE_URL_RE);
	if (localMatch) {
		const [, accountId, queueName] = localMatch;
		return `arn:aws:sqs:${DEFAULT_AWS_REGION}:${accountId}:${queueName}`;
	}

	throw new Error(`Cannot derive an SQS ARN from queue URL: ${queueUrl}`);
};
