const uniqueQueueUrls = (queueUrls: Array<string | undefined>): string[] =>
	Array.from(
		new Set(
			queueUrls.filter((queueUrl): queueUrl is string => Boolean(queueUrl)),
		),
	);

export const getAsyncTrackProducerQueueUrl = ({
	standardQueueUrl = process.env.TRACK_ASYNC_STANDARD_SQS_QUEUE_URL,
	legacyFifoQueueUrl = process.env.TRACK_ASYNC_SQS_QUEUE_URL,
}: {
	standardQueueUrl?: string;
	legacyFifoQueueUrl?: string;
} = {}): string | undefined => standardQueueUrl || legacyFifoQueueUrl;

export const getAsyncTrackWorkerQueueUrls = ({
	standardQueueUrl = process.env.TRACK_ASYNC_STANDARD_SQS_QUEUE_URL,
	legacyFifoQueueUrl = process.env.TRACK_ASYNC_SQS_QUEUE_URL,
}: {
	standardQueueUrl?: string;
	legacyFifoQueueUrl?: string;
} = {}): string[] => uniqueQueueUrls([standardQueueUrl, legacyFifoQueueUrl]);

export const getUpdateBalanceProducerQueueUrl = ({
	updateBalanceQueueUrl = process.env.UPDATE_BALANCE_SQS_QUEUE_URL,
	legacyFifoQueueUrl = process.env.TRACK_ASYNC_SQS_QUEUE_URL,
}: {
	updateBalanceQueueUrl?: string;
	legacyFifoQueueUrl?: string;
} = {}): string | undefined => updateBalanceQueueUrl || legacyFifoQueueUrl;

export const getTrackAndUpdateBalanceWorkerQueueUrls = ({
	standardQueueUrl = process.env.TRACK_ASYNC_STANDARD_SQS_QUEUE_URL,
	updateBalanceQueueUrl = process.env.UPDATE_BALANCE_SQS_QUEUE_URL,
	legacyFifoQueueUrl = process.env.TRACK_ASYNC_SQS_QUEUE_URL,
}: {
	standardQueueUrl?: string;
	updateBalanceQueueUrl?: string;
	legacyFifoQueueUrl?: string;
} = {}): string[] =>
	uniqueQueueUrls([
		standardQueueUrl,
		updateBalanceQueueUrl,
		legacyFifoQueueUrl,
	]);
