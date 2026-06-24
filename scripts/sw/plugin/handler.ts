// herdr `worktree.created` handler. Self-contained on purpose (no sibling imports)
// so it keeps working whether herdr links or copies the plugin dir. It only reads
// the event, gates on @autumn, and injects the picker into the new worktree's
// first pane via the herdr CLI — all real work lives in scripts/sw/index.ts.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import Bun from "bun";

const HERDR = process.env.HERDR_BIN_PATH || "herdr";
const DEBUG_LOG = join(homedir(), ".config", "atmn-sw", "handler.log");

type Worktree = { path?: string; checkout_path?: string };
type Workspace = { workspace_id?: string };
type EventBody = { worktree?: Worktree; workspace?: Workspace };
type Event = EventBody & { data?: EventBody };

function debug(line: string): void {
	try {
		mkdirSync(join(homedir(), ".config", "atmn-sw"), { recursive: true });
		appendFileSync(DEBUG_LOG, `${line}\n`);
	} catch {
		// best-effort; never let logging break the handler
	}
}

function herdr(args: string[]): { stdout: string; code: number } {
	const proc = Bun.spawnSync([HERDR, ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		stdout: new TextDecoder().decode(proc.stdout).trim(),
		code: proc.exitCode ?? 1,
	};
}

function isAutumnRepo(checkoutPath: string): boolean {
	const pkgPath = join(checkoutPath, "package.json");
	if (!existsSync(pkgPath)) return false;
	try {
		const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string };
		return pkg.name === "autumn";
	} catch {
		return false;
	}
}

function firstPaneId(workspaceId: string): string | null {
	// herdr CLI emits a JSON-RPC envelope and exits 0 even on bad flags, so parse
	// `result.panes` rather than trusting the exit code. (No `--json` flag exists.)
	const res = herdr(["pane", "list", "--workspace", workspaceId]);
	try {
		const parsed = JSON.parse(res.stdout) as {
			result?: { panes?: Array<{ pane_id?: string }> };
		};
		return parsed.result?.panes?.[0]?.pane_id ?? null;
	} catch {
		return null;
	}
}

function main(): void {
	const raw = process.env.HERDR_PLUGIN_EVENT_JSON ?? "";
	debug(
		`--- invoked HERDR_WORKSPACE_ID=${process.env.HERDR_WORKSPACE_ID ?? ""}`,
	);
	debug(`event=${raw}`);
	if (!raw) return;

	let event: Event;
	try {
		event = JSON.parse(raw) as Event;
	} catch {
		return;
	}

	// herdr's WorktreeInfo field is `path` (not `checkout_path`); accept either, and
	// look in both the `.data` envelope and the top level to be transport-agnostic.
	const body: EventBody = event.data ?? event;
	const checkoutPath = body.worktree?.path ?? body.worktree?.checkout_path;
	const workspaceId =
		body.workspace?.workspace_id || process.env.HERDR_WORKSPACE_ID;
	if (!checkoutPath || !workspaceId) {
		debug(`skip: checkoutPath=${checkoutPath} workspaceId=${workspaceId}`);
		return;
	}
	if (!isAutumnRepo(checkoutPath)) {
		debug(`skip: not @autumn at ${checkoutPath}`);
		return;
	}

	const paneId = firstPaneId(workspaceId);
	if (!paneId) {
		debug(`skip: no first pane for workspace ${workspaceId}`);
		return;
	}

	// Resolve the CLI next to this plugin (the installed stable copy), NOT inside
	// the new worktree — which may be branched off a commit without scripts/sw.
	const cli = join(import.meta.dir, "..", "index.ts");
	debug(`inject: pane ${paneId} -> exec bun ${cli} pick`);
	// `exec` so the CLI replaces the pane's shell — later `exec ssh` leaves no orphan.
	herdr(["pane", "run", paneId, `exec bun ${cli} pick`]);
}

main();
