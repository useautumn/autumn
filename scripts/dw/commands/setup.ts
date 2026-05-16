import { fatal, log } from "../helpers/shell.ts";
import { getCanonicalWorktree, getCurrentWorktree } from "../helpers/git.ts";
import {
	loadRegistry,
	saveRegistry,
	reconcile,
	allocateWorktreeNumber,
	deriveBranchName,
} from "../helpers/registry.ts";
import { setupAgentWorktree, autoSetupTestOrg } from "../helpers/setup.ts";
import { ensureComposeStack } from "../helpers/compose.ts";
import { writeEnvLocalFiles } from "../helpers/env-files.ts";
import { ensureEmulateRunning } from "../helpers/emulate.ts";
import type { RegistryEntry } from "../types.ts";

export async function cmdSetup(): Promise<RegistryEntry> {
	if (process.env.NODE_ENV === "production") {
		fatal("bun dw is disabled in production");
	}

	const canonical = getCanonicalWorktree();
	const cwd = getCurrentWorktree();
	let registry = loadRegistry();
	registry = reconcile(registry);

	let entry = registry[cwd];
	if (!entry) {
		const worktreeNum = allocateWorktreeNumber(cwd, registry, canonical);
		const branchName =
			worktreeNum === 1 ? undefined : deriveBranchName(cwd, worktreeNum);
		entry = {
			path: cwd,
			worktreeNum,
			createdAt: Date.now(),
			...(branchName && { branchName }),
		};
		registry[cwd] = entry;
		saveRegistry(registry);
		log(
			`registered ${cwd} as worktree ${worktreeNum}${branchName ? ` (branch=${branchName})` : ""}`,
		);
	} else {
		entry.lastUsedAt = Date.now();
		registry[cwd] = entry;
		saveRegistry(registry);
		log(
			`resuming worktree ${entry.worktreeNum}${entry.branchName ? ` (branch=${entry.branchName})` : ""}`,
		);
	}

	if (entry.worktreeNum > 1) {
		entry = await setupAgentWorktree(entry, registry);
		ensureComposeStack(entry.worktreeNum);
		writeEnvLocalFiles(entry);
		await autoSetupTestOrg(entry);
		ensureEmulateRunning();
	}

	return entry;
}
