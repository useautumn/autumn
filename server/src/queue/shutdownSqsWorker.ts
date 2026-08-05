import {
	flushSqsProducers,
	shutdownSqsProducers,
} from "./shutdownSqsProducers.js";

type ExitProcess = (code: number) => void;

export const shutdownSqsWorker = async ({
	pollingLoops,
	flushSqsProducersFn = flushSqsProducers,
	shutdownSqsProducersFn = shutdownSqsProducers,
	isProduction = process.env.NODE_ENV === "production",
	shutdownTimeoutMs = 5000,
	exitProcess = (code) => process.exit(code),
	logError = (message, error) => console.error(message, error),
}: {
	pollingLoops: Promise<void>[];
	flushSqsProducersFn?: () => Promise<void>;
	shutdownSqsProducersFn?: () => Promise<void>;
	isProduction?: boolean;
	shutdownTimeoutMs?: number;
	exitProcess?: ExitProcess;
	logError?: (message: string, error: unknown) => void;
}): Promise<void> => {
	if (isProduction) {
		const shutdownTimeout = setTimeout(() => exitProcess(0), shutdownTimeoutMs);
		shutdownTimeout.unref?.();
	}

	try {
		await flushSqsProducersFn();
	} catch (error) {
		logError(
			`[SQS Worker ${process.pid}] Failed to flush SQS producers before waiting for active messages`,
			error,
		);
	}

	await Promise.allSettled(pollingLoops);
	try {
		await shutdownSqsProducersFn();
	} catch (error) {
		logError(
			`[SQS Worker ${process.pid}] Failed to drain SQS producers`,
			error,
		);
	}

	if (!isProduction) {
		exitProcess(0);
	}
};
