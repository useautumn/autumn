import { type AutumnLogger, createAppLogger } from "@autumn/logging";

let logger: AutumnLogger | undefined;

/**
 * Console only: Atom runs in a customer's cloud, so its logs stay there. A deployed Atom writes one JSON
 * line per event through a buffered stream that never blocks a request; the pretty output is for a dev stack.
 */
export function getAtomLogger(): AutumnLogger {
	logger ??= createAppLogger({
		service: "atom",
		preset: "console-only",
		// Read raw: the logger must exist before, and without, the validated env.
		outputs:
			process.env.ATOM_DEV === "true" ? ["console-pretty"] : ["console-json"],
	});
	return logger;
}
