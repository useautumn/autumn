import { getBalanceWorkerEnv } from "@autumn/env/balanceWorker";
import { initInfisical } from "@autumn/shared/utils/infisical";
import { createBalanceWorker } from "./init/createBalanceWorker.js";
import type { BalanceWorker } from "./init/types/balanceWorker.js";
import { errorCauseChain } from "./logging/errorCauseChain.js";
import { getBalanceWorkerLogger } from "./logging/getBalanceWorkerLogger.js";

async function main(): Promise<void> {
	try {
		await initInfisical();
		const env = getBalanceWorkerEnv();
		const worker = await createBalanceWorker({
			ctx: {
				onError: reportError,
				onServiceStopped: exitAfterServiceStopped,
				logger: getBalanceWorkerLogger(),
			},
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

/** A partition failing terminally shuts the whole partition service down, and
 *  nothing restarts a stopped consumer. Without ending the process the task
 *  stays up owning nothing, its health endpoint still answers, and the scheduler
 *  never replaces it: staging watched a fleet sit at zero ready partitions until
 *  someone redeployed it by hand. Exiting non-zero hands that decision back to
 *  the scheduler, which is what the shutdown was assuming all along. */
function exitAfterServiceStopped(): void {
	getBalanceWorkerLogger().error(
		{},
		"Balance worker partition service stopped; exiting so the task is replaced",
	);
	process.exitCode = 1;
	async function endProcess(): Promise<void> {
		try {
			await getBalanceWorkerLogger().flush?.();
		} finally {
			process.exit(1);
		}
	}
	void endProcess();
}

function causeToLine({ name, message }: { name: string; message: string }) {
	return `${name}: ${message}`;
}

function reportError({ cause }: { cause: unknown }): void {
	const causes = errorCauseChain({ error: cause });
	// The chain rides in the message too: `data` is hidden from the local terminal, and the root cause is what matters.
	const rootCauses = causes.map(causeToLine).join(" <- ");
	getBalanceWorkerLogger().error(
		{ error: cause, data: { causes } },
		rootCauses
			? `Balance worker error <- ${rootCauses}`
			: "Balance worker error",
	);
}

void main();
