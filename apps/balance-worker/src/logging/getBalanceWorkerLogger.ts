import { type AutumnLogger, createAppLogger } from "@autumn/logging";

let logger: AutumnLogger | undefined;

export function getBalanceWorkerLogger(): AutumnLogger {
	logger ??= createAppLogger({
		service: "balance-worker",
		dataset: "express",
		preset: "dual",
		context: {
			workerDeployment: process.env.BALANCE_WORKER_DEPLOYMENT ?? "unknown",
		},
	});
	return logger;
}
