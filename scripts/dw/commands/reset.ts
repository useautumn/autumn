import { log, fatal } from "../helpers/shell.ts";
import { getCurrentWorktree } from "../helpers/git.ts";
import { loadRegistry, saveRegistry } from "../helpers/registry.ts";
import { deleteBranch } from "../helpers/neon.ts";
import { tmuxSessionName, killTmuxSession } from "../helpers/tmux.ts";
import { removeComposeStack } from "../helpers/compose.ts";
import { removeEnvLocalFiles, writeEnvLocalFiles } from "../helpers/env-files.ts";
import { setupAgentWorktree } from "../helpers/setup.ts";
import type { RegistryEntry } from "../types.ts";

export async function cmdReset(): Promise<void> {
	const cwd = getCurrentWorktree();
	const registry = loadRegistry();
	const entry = registry[cwd];
	if (!entry || entry.worktreeNum === 1) {
		fatal("reset only valid in a registered agent worktree");
	}
	killTmuxSession(tmuxSessionName(entry.worktreeNum));
	if (entry.branchName) deleteBranch(entry.branchName);
	// shared/drizzle/ is rewritten on next setupAgentWorktree; no need to clear here.
	removeComposeStack(entry.worktreeNum);
	removeEnvLocalFiles();
	const cleared: RegistryEntry = {
		...entry,
		branchId: undefined,
		databaseUrl: undefined,
		lastUsedAt: Date.now(),
	};
	registry[cwd] = cleared;
	saveRegistry(registry);
	log(`reset ${entry.branchName ?? entry.path}, re-provisioning…`);
	const provisioned = await setupAgentWorktree(cleared, registry);
	writeEnvLocalFiles(provisioned);
}
