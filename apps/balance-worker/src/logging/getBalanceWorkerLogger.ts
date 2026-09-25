import { type AutumnLogger, createAppLogger } from "@autumn/logging";

let logger: AutumnLogger | undefined;

export function getBalanceWorkerLogger(): AutumnLogger {
	const local =
		process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
	logger ??= createAppLogger({
		service: "balance-worker",
		dataset: "express",
		preset: "dual",
		// Deployed, FireLens ships stdout to Axiom and CloudWatch. Adding pino's own
		// Axiom transport sent every line twice, through a thread whose buffer
		// bookkeeping cost ~10% of a busy worker's CPU.
		...(local ? {} : { outputs: ["console-json"] as const }),
		context: {
			workerDeployment: process.env.BALANCE_WORKER_DEPLOYMENT ?? "unknown",
		},
	});
	return logger;
}
