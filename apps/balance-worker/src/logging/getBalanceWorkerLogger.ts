import { type AutumnLogger, createAppLogger } from "@autumn/logging";

let logger: AutumnLogger | undefined;

export function getBalanceWorkerLogger(): AutumnLogger {
	logger ??= createAppLogger({
		service: "balance-worker",
		dataset: "express",
		preset: "dual",
	});
	return logger;
}
