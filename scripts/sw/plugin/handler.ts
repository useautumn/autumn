// herdr `worktree.created` handler. Self-contained on purpose (no sibling imports)
// so it keeps working whether herdr links or copies the plugin dir. It only reads
// the event, gates on @autumn, and injects the picker into the new worktree's
// first pane via the herdr CLI — all real work lives in scripts/sw/index.ts.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Bun from "bun";

const HERDR = process.env.HERDR_BIN_PATH || "herdr";

type Event = {
	data?: {
		worktree?: { checkout_path?: string };
		workspace?: { workspace_id?: string };
	};
};

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
	const res = herdr(["pane", "list", "--workspace", workspaceId, "--json"]);
	if (res.code !== 0) return null;
	try {
		const parsed = JSON.parse(res.stdout) as
			| Array<{ pane_id?: string; id?: string }>
			| { panes?: Array<{ pane_id?: string; id?: string }> };
		const panes = Array.isArray(parsed) ? parsed : (parsed.panes ?? []);
		return panes[0]?.pane_id ?? panes[0]?.id ?? null;
	} catch {
		return null;
	}
}

function main(): void {
	const raw = process.env.HERDR_PLUGIN_EVENT_JSON;
	if (!raw) return;
	let event: Event;
	try {
		event = JSON.parse(raw) as Event;
	} catch {
		return;
	}

	const checkoutPath = event.data?.worktree?.checkout_path;
	const workspaceId =
		event.data?.workspace?.workspace_id || process.env.HERDR_WORKSPACE_ID;
	if (!checkoutPath || !workspaceId) return;
	if (!isAutumnRepo(checkoutPath)) return;

	const paneId = firstPaneId(workspaceId);
	if (!paneId) {
		console.error("[sw] could not resolve first pane; skipping picker");
		return;
	}

	const cli = join(checkoutPath, "scripts/sw/index.ts");
	// `exec` so the CLI replaces the pane's shell — later `exec ssh` leaves no orphan.
	herdr(["pane", "run", paneId, `exec bun ${cli} pick`]);
}

main();
