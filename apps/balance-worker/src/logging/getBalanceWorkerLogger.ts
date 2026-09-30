import { type AutumnLogger, createAppLogger } from "@autumn/logging";

let logger: AutumnLogger | undefined;

/** Which ECS service, fleet and build this task is. Learned after the logger exists, so it is mixed into
 *  each line at write time rather than bound at creation: a crashed worker can then be tied to blue or
 *  green from any of its lines, not only its startup line. */
const identity: {
	aws?: { serviceArn: string | null; imageSha: string | null };
	fleetId?: string | null;
} = {};

export function bindBalanceWorkerLogIdentity({
	serviceArn,
	imageSha,
	fleetId,
}: {
	serviceArn: string | null;
	imageSha: string | null;
	fleetId: string | null;
}): void {
	identity.aws = { serviceArn, imageSha };
	identity.fleetId = fleetId;
}

function logIdentity(): Record<string, unknown> {
	return { ...identity };
}

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
		mixin: logIdentity,
	});
	return logger;
}
