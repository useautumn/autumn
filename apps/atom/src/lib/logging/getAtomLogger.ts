import { type AutumnLogger, createAppLogger } from "@autumn/logging";
import { atomLogOutputs } from "./atomLogOutputs.js";

let logger: AutumnLogger | undefined;

export function getAtomLogger(): AutumnLogger {
	logger ??= createAppLogger({
		service: "atom",
		preset: "console-only",
		outputs: atomLogOutputs({ env: process.env }),
	});
	return logger;
}
