import { type AutumnLogger, createAppLogger } from "@autumn/logging";
import { atomLogOutputs } from "./atomLogOutputs.js";

/** The org a line names, in the server's `context.*` shape so one query covers both. */
export type LogOrg = { org_id: string; org_slug: string };

let logger: AutumnLogger | undefined;
let org: LogOrg | undefined;

/** Set from Autumn's first keys check: every line after it names the org. */
export const setLogOrg = (named: LogOrg) => {
	org = named;
};
export const logOrg = () => org;

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
		// A mixin, not a binding: a request line's own `context` replaces it, where a bound one would repeat the key.
		mixin: () => (org ? { context: org } : {}),
	});
	return logger;
}
