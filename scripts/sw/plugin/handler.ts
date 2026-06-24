// herdr worktree/tab event handler. Self-contained (no sibling imports) so it
// keeps working whether herdr links or copies the plugin dir. It logs every event
// it receives, and injects the picker into the worktree's first pane only for a
// fresh, unconfigured @autumn worktree — all real work lives in ../index.ts.

import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import Bun from "bun";

const HERDR = process.env.HERDR_BIN_PATH || "herdr";
const CONFIG_HOME = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
const DEBUG_LOG = join(CONFIG_HOME, "atmn-sw", "handler.log");
const PROMPTED_DIR = join(CONFIG_HOME, "atmn-sw", "prompted");
const REGISTRY = join(homedir(), ".autumn-sw", "registry.json");
// Events that should PROMPT (others are logged only, for diagnosis).
const ACT_EVENTS = new Set([
	"worktree_created",
	"worktree_opened",
	"tab_created",
]);

type Worktree = { path?: string; checkout_path?: string };
type EventBody = {
	worktree?: Worktree;
	workspace?: { workspace_id?: string };
	already_open?: boolean;
};
type Event = EventBody & { event?: string; data?: EventBody };
type Pane = { pane_id?: string; cwd?: string };

function debug(line: string): void {
	try {
		mkdirSync(join(CONFIG_HOME, "atmn-sw"), { recursive: true });
		appendFileSync(DEBUG_LOG, `${line}\n`);
	} catch {
		// best-effort; never let logging break the handler
	}
}

// herdr CLI emits a JSON-RPC envelope and exits 0 even on bad flags → parse result.
function herdrResult<T>(args: string[]): T | null {
	const proc = Bun.spawnSync([HERDR, ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});
	try {
		const parsed = JSON.parse(new TextDecoder().decode(proc.stdout)) as {
			result?: T;
		};
		return parsed.result ?? null;
	} catch {
		return null;
	}
}

function firstPane(workspaceId: string): Pane | null {
	const result = herdrResult<{ panes?: Pane[] }>([
		"pane",
		"list",
		"--workspace",
		workspaceId,
	]);
	return result?.panes?.[0] ?? null;
}

function isAutumnRepo(checkout: string): boolean {
	const pkgPath = join(checkout, "package.json");
	if (!existsSync(pkgPath)) return false;
	try {
		const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string };
		return pkg.name === "autumn";
	} catch {
		return false;
	}
}

function alreadyConfigured(checkout: string): boolean {
	if (existsSync(join(checkout, ".herdr-remote"))) return true;
	try {
		const reg = JSON.parse(readFileSync(REGISTRY, "utf8")) as Record<
			string,
			unknown
		>;
		return checkout in reg;
	} catch {
		return false;
	}
}

function main(): void {
	const raw = process.env.HERDR_PLUGIN_EVENT_JSON ?? "";
	let event: Event = {};
	try {
		event = JSON.parse(raw) as Event;
	} catch {
		// fall through with empty event
	}
	const kind = event.event ?? "";
	debug(`--- ${kind} ws=${process.env.HERDR_WORKSPACE_ID ?? ""}`);
	debug(`event=${raw}`);
	if (!ACT_EVENTS.has(kind)) return;

	const body: EventBody = event.data ?? event;
	if (body.already_open) {
		debug("skip: already_open");
		return;
	}

	const workspaceId =
		body.workspace?.workspace_id || process.env.HERDR_WORKSPACE_ID;
	if (!workspaceId) {
		debug("skip: no workspace id");
		return;
	}

	// Prefer the worktree path from the event; fall back to the first pane's cwd
	// (tab.created carries no worktree, so we resolve it from the workspace).
	const pane = firstPane(workspaceId);
	const checkout =
		body.worktree?.path ?? body.worktree?.checkout_path ?? pane?.cwd;
	const paneId = pane?.pane_id;
	if (!checkout || !paneId) {
		debug(`skip: checkout=${checkout} pane=${paneId}`);
		return;
	}
	if (!isAutumnRepo(checkout)) {
		debug(`skip: not @autumn at ${checkout}`);
		return;
	}
	if (alreadyConfigured(checkout)) {
		debug(`skip: already configured ${checkout}`);
		return;
	}

	// One-shot guard: a single "New worktree" emits several events (worktree.created
	// + tab.created), so prompt only once per checkout.
	const guard = join(PROMPTED_DIR, checkout.replace(/[^a-zA-Z0-9]/g, "_"));
	if (existsSync(guard)) {
		debug(`skip: already prompted ${checkout}`);
		return;
	}
	mkdirSync(PROMPTED_DIR, { recursive: true });
	writeFileSync(guard, "");

	// Resolve the CLI next to this plugin (the installed stable copy), NOT inside
	// the new worktree — which may be branched off a commit without scripts/sw.
	const cli = join(import.meta.dir, "..", "index.ts");
	debug(`inject: pane ${paneId} -> exec bun ${cli} pick`);
	Bun.spawnSync([HERDR, "pane", "run", paneId, `exec bun ${cli} pick`]);
}

main();
