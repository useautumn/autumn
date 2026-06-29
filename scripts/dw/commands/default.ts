import { killOwnPorts } from "../helpers/ports.ts";
import { getCurrentWorktree } from "../helpers/git.ts";
import { loadRegistry } from "../helpers/registry.ts";
import { isProvisioned } from "../helpers/entry.ts";
import { fatal } from "../helpers/shell.ts";
import { startDev } from "../helpers/start.ts";

export async function cmdDefault(): Promise<void> {
	const cwd = getCurrentWorktree();
	const entry = loadRegistry()[cwd];

	if (entry && isProvisioned(entry)) {
		if (!entry.databaseUrl) {
			fatal("run 'bun dw setup' first to provision this worktree");
		}
		killOwnPorts(entry.worktreeNum);
		startDev(entry);
		return;
	}

	killOwnPorts(1);
	startDev({ path: cwd, worktreeNum: 1, createdAt: Date.now() });
}
