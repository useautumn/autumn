const AWS_QUEUE_URL = /^https:\/\/sqs\.([a-z0-9-]+)\.amazonaws\.com\//;

/** The region an AWS queue URL names; undefined for an emulator or a malformed URL. */
export const queueUrlToRegion = ({
	queueUrl,
}: {
	queueUrl: string;
}): string | undefined => queueUrl.match(AWS_QUEUE_URL)?.[1];

/** The emulator base URL when the queue is not on AWS; undefined on AWS. */
export const queueUrlToLocalEndpoint = ({
	queueUrl,
}: {
	queueUrl: string;
}): string | undefined => {
	try {
		const url = new URL(queueUrl);
		if (url.hostname.endsWith("amazonaws.com")) return undefined;
		return `${url.protocol}//${url.host}`;
	} catch {
		return undefined;
	}
};

export const isFifoQueueUrl = ({ queueUrl }: { queueUrl: string }): boolean =>
	queueUrl.endsWith(".fifo");

/** The last path segment: what logs and metrics call the queue. */
export const queueUrlToName = ({ queueUrl }: { queueUrl: string }): string =>
	queueUrl.split("/").pop() ?? "unknown";
