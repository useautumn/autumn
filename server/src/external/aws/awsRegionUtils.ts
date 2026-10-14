export const DEFAULT_AWS_REGION = "us-east-2";

export const extractRegionFromQueueUrl = ({
	queueUrl,
}: {
	queueUrl: string | undefined;
}): string | undefined => {
	if (!queueUrl) return undefined;

	const match = queueUrl.match(
		/^https:\/\/sqs\.([a-z0-9-]+)\.amazonaws\.com\//,
	);

	return match ? match[1] : undefined;
};
