import { sh } from "./shell.ts";

const herdrBin = (): string => process.env.HERDR_BIN_PATH || "herdr";

function herdr(args: string[]): {
	stdout: string;
	stderr: string;
	code: number;
} {
	return sh(herdrBin(), args);
}

type PaneInfo = { pane_id?: string; id?: string };

/** First pane of a workspace — the one herdr spawned with the new worktree. */
export function firstPaneOfWorkspace(workspaceId: string): string | null {
	const res = herdr(["pane", "list", "--workspace", workspaceId, "--json"]);
	if (res.code !== 0) return null;
	try {
		const parsed = JSON.parse(res.stdout) as
			| PaneInfo[]
			| { panes?: PaneInfo[] };
		const panes = Array.isArray(parsed) ? parsed : (parsed.panes ?? []);
		const first = panes[0];
		return first?.pane_id ?? first?.id ?? null;
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
	const res = herdr(args);
	if (res.code !== 0) return null;
	try {
		const parsed = JSON.parse(res.stdout) as PaneInfo;
		return parsed.pane_id ?? parsed.id ?? null;
	} catch {
		return null;
	}
}
