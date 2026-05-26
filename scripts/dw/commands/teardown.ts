import { log, fatal } from "../helpers/shell.ts";
import { getCurrentWorktree } from "../helpers/git.ts";
import {
	loadRegistry,
	saveRegistry,
	hasOtherActiveWorktrees,
} from "../helpers/registry.ts";
import { deleteBranch } from "../helpers/neon.ts";
import { unregisterPortlessAliases } from "../helpers/portless.ts";
import { destroySparqTunnel } from "../helpers/sparq.ts";
import { tmuxSessionName, killTmuxSession } from "../helpers/tmux.ts";
import { removeComposeStack, removeAllAutumnComposeStacks } from "../helpers/compose.ts";
import { removeEnvLocalFiles } from "../helpers/env-files.ts";
import { stopLocalEmulateIfRunning, stopPortlessProxy } from "../helpers/emulate.ts";
import type { Registry } from "../types.ts";

export async function cmdTeardown(opts: { all?: boolean }): Promise<void> {
	let registry = loadRegistry();

	if (opts.all) {
		for (const entry of Object.values(registry)) {
			if (entry.worktreeNum === 1) continue;
			if (entry.branchName) deleteBranch(entry.branchName);
			unregisterPortlessAliases(entry.worktreeNum);
			destroySparqTunnel(entry);
			killTmuxSession(tmuxSessionName(entry.worktreeNum));
		}
		removeAllAutumnComposeStacks();
		const next: Registry = {};
		for (const [p, e] of Object.entries(registry)) {
			if (e.worktreeNum === 1) next[p] = e;
		}
		saveRegistry(next);
		// Only the cwd's .env.local lives at PROJECT_ROOT; other worktrees own
		// their own copy and aren't reachable from here. Acceptable trade-off.
		removeEnvLocalFiles();
		stopLocalEmulateIfRunning();
		stopPortlessProxy();
		log("teardown --all complete");
		return;
	}

	const cwd = getCurrentWorktree();
	const entry = registry[cwd];
	if (!entry) {
		log(`no registry entry for ${cwd}, nothing to teardown`);
		return;
	}
	if (entry.worktreeNum === 1) {
		fatal("refusing to teardown canonical worktree (worktreeNum=1)");
	}
	if (entry.branchName) deleteBranch(entry.branchName);
	unregisterPortlessAliases(entry.worktreeNum);
	destroySparqTunnel(entry);
	killTmuxSession(tmuxSessionName(entry.worktreeNum));
	removeComposeStack(entry.worktreeNum);
	delete registry[cwd];
	saveRegistry(registry);
	removeEnvLocalFiles();
	log(`tore down ${entry.branchName ?? "worktree " + entry.worktreeNum}`);

	if (!hasOtherActiveWorktrees(registry, cwd)) {
		stopLocalEmulateIfRunning();
		stopPortlessProxy();
	} else {
		log("other agent worktrees still active; leaving portless running");
	}
}
