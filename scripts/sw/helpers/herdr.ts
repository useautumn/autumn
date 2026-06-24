import { sh } from "./shell.ts";

const herdrBin = (): string => process.env.HERDR_BIN_PATH || "herdr";

// herdr CLI commands emit a JSON-RPC envelope (`{id, result, ...}`) and exit 0
// even on bad flags — so callers parse `result`, never trust the exit code.
function herdr(args: string[]): string {
	return sh(herdrBin(), args).stdout;
}

function parseResult<T>(stdout: string): T | null {
	try {
		return (JSON.parse(stdout) as { result?: T }).result ?? null;
	} catch {
		return null;
	}
}

/** Type a command + Enter into a pane's running shell (does not respawn it). */
export function paneRun(paneId: string, command: string): void {
	herdr(["pane", "run", paneId, command]);
}

export function paneRename(paneId: string, name: string): void {
	herdr(["pane", "rename", paneId, name]);
}

/** Split a pane and return the new pane id, or null on failure. */
export function paneSplit(
	paneId: string,
	opts: { direction: "right" | "down" | "left" | "up"; ratio?: number },
): string | null {
	const args = ["pane", "split", paneId, "--direction", opts.direction];
	if (opts.ratio !== undefined) args.push("--ratio", String(opts.ratio));
	args.push("--no-focus");
	const result = parseResult<{ pane?: { pane_id?: string } }>(herdr(args));
	return result?.pane?.pane_id ?? null;
}
