export const getAsyncTrackProducerQueueUrl = ({
	standardQueueUrl = process.env.TRACK_ASYNC_STANDARD_SQS_QUEUE_URL,
	legacyFifoQueueUrl = process.env.TRACK_ASYNC_SQS_QUEUE_URL,
}: {
	standardQueueUrl?: string;
	legacyFifoQueueUrl?: string;
} = {}): string | undefined => standardQueueUrl ?? legacyFifoQueueUrl;

export const getAsyncTrackWorkerQueueUrls = ({
	standardQueueUrl = process.env.TRACK_ASYNC_STANDARD_SQS_QUEUE_URL,
	legacyFifoQueueUrl = process.env.TRACK_ASYNC_SQS_QUEUE_URL,
}: {
	standardQueueUrl?: string;
	legacyFifoQueueUrl?: string;
} = {}): string[] =>
	Array.from(
		new Set(
			[standardQueueUrl, legacyFifoQueueUrl].filter(
				(queueUrl): queueUrl is string => Boolean(queueUrl),
			),
		),
	);
