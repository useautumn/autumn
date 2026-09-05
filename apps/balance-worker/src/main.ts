import { getBalanceWorkerEnv } from "@autumn/env/balanceWorker";
import { createBalanceWorker } from "./init/createBalanceWorker.js";
import type { BalanceWorker } from "./init/types/balanceWorker.js";
import { getBalanceWorkerLogger } from "./logging/getBalanceWorkerLogger.js";

async function main(): Promise<void> {
	try {
		const env = getBalanceWorkerEnv();
		const worker = await createBalanceWorker({
			ctx: { onError: reportError, logger: getBalanceWorkerLogger() },
			config: { env },
		});
		registerShutdownSignals({ worker });
		await worker.start();
	} catch (cause) {
		reportError({ cause });
		process.exitCode = 1;
		await getBalanceWorkerLogger().flush?.();
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
		} finally {
			await getBalanceWorkerLogger().flush?.();
		}
	}

	process.once("SIGINT", shutdown);
	process.once("SIGTERM", shutdown);
}

function reportError({ cause }: { cause: unknown }): void {
	getBalanceWorkerLogger().error({ error: cause }, "Balance worker error");
}

void main();
