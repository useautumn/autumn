import { log, fatal } from "../helpers/shell.ts";
import { getCurrentWorktree } from "../helpers/git.ts";
import { loadRegistry, saveRegistry } from "../helpers/registry.ts";
import { isPlainCanonical } from "../helpers/entry.ts";
import { deleteBranch } from "../helpers/neon.ts";
import { tmuxSessionName, killTmuxSession } from "../helpers/tmux.ts";
import { removeComposeStack } from "../helpers/compose.ts";
import { removeEnvLocalFiles } from "../helpers/env-files.ts";
import { provisionWorktree } from "../helpers/provision.ts";
import type { RegistryEntry } from "../types.ts";

export async function cmdReset(): Promise<void> {
	const cwd = getCurrentWorktree();
	const registry = loadRegistry();
	const entry = registry[cwd];
	if (!entry || isPlainCanonical(entry)) {
		fatal("reset only valid in a provisioned worktree");
	}
	if (entry.worktreeNum > 1) {
		killTmuxSession(tmuxSessionName(entry.worktreeNum));
	}
	if (entry.branchName) {
		deleteBranch(entry.branchName, { projectId: entry.neonProjectId });
	}
	removeComposeStack(entry.worktreeNum, entry.branchName);
	removeEnvLocalFiles();
	const cleared: RegistryEntry = {
		...entry,
		branchId: undefined,
		databaseUrl: undefined,
		reservedDomainId: undefined,
		ngrokUrl: undefined,
		lastUsedAt: Date.now(),
	};
	registry[cwd] = cleared;
	saveRegistry(registry);
	log(`reset ${entry.branchName ?? entry.path}, re-provisioning…`);
	await provisionWorktree({ entry: cleared, registry, cwd });
}
