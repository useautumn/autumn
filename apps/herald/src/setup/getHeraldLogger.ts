import { createErrorLogHook } from "@autumn/errors";
import { type AutumnLogger, createAppLogger } from "@autumn/logging";

let logger: AutumnLogger | undefined;

export function getHeraldLogger(): AutumnLogger {
	logger ??= createAppLogger({
		service: "herald",
		dataset: "express",
		preset: "dual",
		hooks: {
			logMethod: createErrorLogHook({
				service: "herald",
				captureToSentry: process.env.SENTRY_CAPTURE_LOGGED_ERRORS !== "false",
			}),
		},
	});
	return logger;
}
