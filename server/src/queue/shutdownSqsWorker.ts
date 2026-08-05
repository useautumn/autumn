import { shutdownSqsProducers } from "./shutdownSqsProducers.js";

type ExitProcess = (code: number) => void;

export const shutdownSqsWorker = async ({
	pollingLoops,
	shutdownSqsProducersFn = shutdownSqsProducers,
	isProduction = process.env.NODE_ENV === "production",
	shutdownTimeoutMs = 5000,
	exitProcess = (code) => process.exit(code),
	logError = (message, error) => console.error(message, error),
}: {
	pollingLoops: Promise<void>[];
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
