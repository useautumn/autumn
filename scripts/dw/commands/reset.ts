import { removeComposeStack } from "../helpers/compose.ts";
import { isPlainCanonical } from "../helpers/entry.ts";
import { removeEnvLocalFiles } from "../helpers/env-files.ts";
import { getCurrentWorktree } from "../helpers/git.ts";
import { deleteBranch } from "../helpers/neon.ts";
import { provisionWorktree } from "../helpers/provision.ts";
import { loadRegistry, saveRegistry } from "../helpers/registry.ts";
import { fatal, log } from "../helpers/shell.ts";
import { killTmuxSession, tmuxSessionName } from "../helpers/tmux.ts";
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
