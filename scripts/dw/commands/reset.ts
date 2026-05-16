import { log, fatal } from "../helpers/shell.ts";
import { getCurrentWorktree } from "../helpers/git.ts";
import { loadRegistry, saveRegistry } from "../helpers/registry.ts";
import { deleteBranch } from "../helpers/neon.ts";
import { tmuxSessionName, killTmuxSession } from "../helpers/tmux.ts";
import { removeComposeStack } from "../helpers/compose.ts";
import { removeEnvLocalFiles } from "../helpers/env-files.ts";
import { setupAgentWorktree } from "../helpers/setup.ts";
import { SHARED_DIR } from "../constants.ts";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
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
	if (entry.branchName) {
		const localDir = join(SHARED_DIR, "drizzle-local", entry.branchName);
		if (existsSync(localDir)) rmSync(localDir, { recursive: true, force: true });
	}
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
	await setupAgentWorktree(cleared, registry);
}
