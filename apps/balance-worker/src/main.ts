import { getBalanceWorkerEnv } from "@autumn/env/balanceWorker";
import { flushErrorReports, initErrorReporting } from "@autumn/errors";
import { initInfisical } from "@autumn/shared/utils/infisical";
import { createBalanceWorker } from "./init/createBalanceWorker.js";
import type { BalanceWorker } from "./init/types/balanceWorker.js";
import { errorCauseChain } from "./logging/errorCauseChain.js";
import {
	bindBalanceWorkerLogIdentity,
	getBalanceWorkerLogger,
} from "./logging/getBalanceWorkerLogger.js";
import { reportWorkerError } from "./logging/reportWorkerError.js";
import type { PartitionServiceStopReason } from "./partitions/types/partitions.js";

async function main(): Promise<void> {
	try {
		await initInfisical();
		initErrorReporting({ tracesRequests: false });
		const env = getBalanceWorkerEnv();
		const worker = await createBalanceWorker({
			ctx: {
				onError: reportError,
				onServiceStopped: exitAfterServiceStopped,
				onIdentityResolved: bindBalanceWorkerLogIdentity,
				logger: getBalanceWorkerLogger(),
			},
			config: { env },
		});
		registerShutdownSignals({ worker });
		await worker.start();
	} catch (cause) {
		reportError({ cause });
		process.exitCode = 1;
		await flushLogsAndErrorReports();
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
			await flushLogsAndErrorReports();
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
function exitAfterServiceStopped({
	cause,
	scope,
}: PartitionServiceStopReason): void {
	const chain = errorCauseChain({ error: cause }).map(causeToLine).join(" <- ");
	getBalanceWorkerLogger().error(
		{ error: cause, data: { scope } },
		`Balance worker service stopped (${scope}); exiting so the task is replaced${chain ? ` <- ${chain}` : ""}`,
	);
	process.exitCode = 1;
	async function endProcess(): Promise<void> {
		try {
			await flushLogsAndErrorReports();
		} finally {
			process.exit(1);
		}
	}
	void endProcess();
}

async function flushLogsAndErrorReports(): Promise<void> {
	await Promise.all([
		getBalanceWorkerLogger().flush?.(),
		flushErrorReports({ timeoutMs: 2_000 }),
	]);
}

function causeToLine({ name, message }: { name: string; message: string }) {
	return `${name}: ${message}`;
}

function reportError({ cause }: { cause: unknown }): void {
	reportWorkerError({ logger: getBalanceWorkerLogger(), cause });
}

void main();
