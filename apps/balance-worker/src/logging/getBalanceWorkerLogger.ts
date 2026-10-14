import { createErrorLogHook } from "@autumn/errors";
import { type AutumnLogger, createAppLogger } from "@autumn/logging";
import { classifyWorkerError } from "./classifyWorkerError.js";

let logger: AutumnLogger | undefined;

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
		...(local ? {} : { outputs: ["console-json"] as const }),
		context: {
			workerDeployment: process.env.BALANCE_WORKER_DEPLOYMENT ?? "unknown",
		},
		mixin: logIdentity,
		hooks: {
			logMethod: createErrorLogHook({
				service: "balance-worker",
				captureToSentry: process.env.SENTRY_CAPTURE_LOGGED_ERRORS !== "false",
				classifiers: [classifyWorkerError],
			}),
		},
	});
	return logger;
}
