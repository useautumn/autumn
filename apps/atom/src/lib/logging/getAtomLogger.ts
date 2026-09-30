import { type AutumnLogger, createAppLogger } from "@autumn/logging";

let logger: AutumnLogger | undefined;

/** Console only: Atom runs in a customer's cloud, so its logs stay there. */
export function getAtomLogger(): AutumnLogger {
	logger ??= createAppLogger({ service: "atom", preset: "console-only" });
	return logger;
}
