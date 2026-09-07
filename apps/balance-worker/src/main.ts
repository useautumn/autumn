import { getBalanceWorkerEnv } from "@autumn/env/balanceWorker";
import { createBalanceWorker } from "./init/createBalanceWorker.js";
import type { BalanceWorker } from "./init/types/balanceWorker.js";

async function main(): Promise<void> {
	try {
		const env = getBalanceWorkerEnv();
		const worker = await createBalanceWorker({
			ctx: { onError: reportError },
			config: { env },
		});
		registerShutdownSignals({ worker });
		await worker.start();
		console.info(
			`Balance worker listening at ${env.BALANCE_WORKER_ENDPOINT}; partition admission follows recovery`,
		);
	} catch (cause) {
		reportError({ cause });
		process.exitCode = 1;
	}
}

function registerShutdownSignals({ worker }: { worker: BalanceWorker }): void {
	async function shutdown(): Promise<void> {
		try {
			await worker.stop();
			process.exitCode = 0;
		} catch (cause) {
			reportError({ cause });
			process.exitCode = 1;
		}
	}

	process.once("SIGINT", shutdown);
	process.once("SIGTERM", shutdown);
}

function reportError({ cause }: { cause: unknown }): void {
	console.error("Balance worker error", cause);
}

void main();
