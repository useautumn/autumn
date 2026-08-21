/**
 * Producers prefer TRACK_ASYNC_STANDARD_SQS_QUEUE_URL over TRACK_ASYNC_SQS_QUEUE_URL.
 * Local `.env.local` (and dw seeds) often set STANDARD, so tests that only stub
 * the FIFO URL mock the wrong SQS client and see empty queueCommands.
 */

const restoreEnv = (key: string, value: string | undefined): void => {
	if (value === undefined) {
		delete process.env[key];
	} else {
		process.env[key] = value;
	}
};

export const pinTrackProducerQueueToFifo = ({
	fifoQueueUrl,
}: {
	fifoQueueUrl: string;
}): { restore: () => void } => {
	const originalStandard = process.env.TRACK_ASYNC_STANDARD_SQS_QUEUE_URL;
	const originalFifo = process.env.TRACK_ASYNC_SQS_QUEUE_URL;

	delete process.env.TRACK_ASYNC_STANDARD_SQS_QUEUE_URL;
	process.env.TRACK_ASYNC_SQS_QUEUE_URL = fifoQueueUrl;

	return {
		restore: () => {
			restoreEnv("TRACK_ASYNC_STANDARD_SQS_QUEUE_URL", originalStandard);
			restoreEnv("TRACK_ASYNC_SQS_QUEUE_URL", originalFifo);
		},
	};
};

export const clearTrackProducerQueueUrls = (): {
	restore: () => void;
} => {
	const originalStandard = process.env.TRACK_ASYNC_STANDARD_SQS_QUEUE_URL;
	const originalFifo = process.env.TRACK_ASYNC_SQS_QUEUE_URL;
	const originalLegacy = process.env.TRACK_SQS_QUEUE_URL;

	delete process.env.TRACK_ASYNC_STANDARD_SQS_QUEUE_URL;
	delete process.env.TRACK_ASYNC_SQS_QUEUE_URL;
	delete process.env.TRACK_SQS_QUEUE_URL;

	return {
		restore: () => {
			restoreEnv("TRACK_ASYNC_STANDARD_SQS_QUEUE_URL", originalStandard);
			restoreEnv("TRACK_ASYNC_SQS_QUEUE_URL", originalFifo);
			restoreEnv("TRACK_SQS_QUEUE_URL", originalLegacy);
		},
	};
};
