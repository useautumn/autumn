const AWS_QUEUE_URL = /^https:\/\/sqs\.([a-z0-9-]+)\.amazonaws\.com\//;

export const queueUrlToRegion = ({
	queueUrl,
}: {
	queueUrl: string;
}): string | undefined => queueUrl.match(AWS_QUEUE_URL)?.[1];

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

export const queueUrlToName = ({ queueUrl }: { queueUrl: string }): string =>
	queueUrl.split("/").pop() ?? "unknown";
