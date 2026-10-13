import { type AutumnLogger, createAppLogger } from "@autumn/logging";
import { atomLogOutputs } from "./atomLogOutputs.js";

let logger: AutumnLogger | undefined;

/**
 * Console only: Atom runs in a customer's cloud, so its logs stay there. A deployed Atom writes one JSON
 * line per event through a buffered stream that never blocks a request; the pretty output is for `bun dev`.
 */
export function getAtomLogger(): AutumnLogger {
	logger ??= createAppLogger({
		service: "atom",
		preset: "console-only",
		// Read raw: the logger must exist before, and without, the validated env.
		outputs: atomLogOutputs({ env: process.env }),
	});
	return logger;
}
