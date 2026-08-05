import { describe, expect, test } from "bun:test";
import { shutdownSqsWorker } from "@/queue/shutdownSqsWorker.js";

describe("SQS worker shutdown", () => {
	test("arms the forced-exit deadline before waiting for polling loops", async () => {
		let releasePollingLoop: () => void = () => undefined;
		const pollingLoop = new Promise<void>((resolve) => {
			releasePollingLoop = resolve;
		});
		let markExit: (code: number) => void = () => undefined;
		const exitCode = new Promise<number>((resolve) => {
			markExit = resolve;
		});
		let producerDrainStarted = false;

		const shutdown = shutdownSqsWorker({
			pollingLoops: [pollingLoop],
			shutdownSqsProducersFn: async () => {
				producerDrainStarted = true;
			},
			isProduction: true,
			shutdownTimeoutMs: 5,
			exitProcess: markExit,
		});

		const exitBeforePollingSettled = await Promise.race([
			exitCode,
			Bun.sleep(50).then(() => null),
		]);
		try {
			expect(exitBeforePollingSettled).toBe(0);
			expect(producerDrainStarted).toBeFalse();
		} finally {
			releasePollingLoop();
			await shutdown;
		}
		expect(producerDrainStarted).toBeTrue();
	});

	test("logs producer drain failures and continues to the exit path", async () => {
		const producerFailure = new Error("producer drain failed");
		const loggedErrors: Array<{ message: string; error: unknown }> = [];
		let markExit: (code: number) => void = () => undefined;
		const exitCode = new Promise<number>((resolve) => {
			markExit = resolve;
		});

		const shutdownResult = await shutdownSqsWorker({
			pollingLoops: [],
			shutdownSqsProducersFn: async () => Promise.reject(producerFailure),
			isProduction: true,
			shutdownTimeoutMs: 5,
			exitProcess: markExit,
			logError: (message, error) => loggedErrors.push({ message, error }),
		}).then(
			() => null,
			(error: unknown) => error,
		);
		const observedExitCode = await Promise.race([
			exitCode,
			Bun.sleep(50).then(() => null),
		]);

		expect(shutdownResult).toBeNull();
		expect(observedExitCode).toBe(0);
		expect(loggedErrors).toEqual([
			{
				message: `[SQS Worker ${process.pid}] Failed to drain SQS producers`,
				error: producerFailure,
			},
		]);
	});
});
