import { type AutumnLogger, createAppLogger } from "@autumn/logging";

let logger: AutumnLogger | undefined;

export function getHeraldLogger(): AutumnLogger {
	logger ??= createAppLogger({
		service: "herald",
		dataset: "express",
		preset: "dual",
	});
	return logger;
}
