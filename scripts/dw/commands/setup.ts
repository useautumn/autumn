import { fatal, log, shInherit } from "../helpers/shell.ts";
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
import { PROJECT_ROOT } from "../constants.ts";
import type { RegistryEntry } from "../types.ts";

function ensureAiSubmoduleSynced(): void {
	const aiDir = `${PROJECT_ROOT}/ai`;

	log("ensuring ai submodule is initialized");
	const submoduleCode = shInherit(
		"git",
		["submodule", "update", "--init", "--recursive"],
		{ cwd: PROJECT_ROOT },
	);
	if (submoduleCode !== 0) {
		fatal(
			`git submodule update --init --recursive failed (exit ${submoduleCode})`,
		);
	}

	log("checking out ai submodule main branch");
	const checkoutCode = shInherit("git", ["checkout", "main"], {
		cwd: aiDir,
	});
	if (checkoutCode !== 0) {
		fatal(`git checkout main failed in ai submodule (exit ${checkoutCode})`);
	}

	log("ensuring ai deps installed (bun install)");
	const installCode = shInherit("bun", ["install"], { cwd: aiDir });
	if (installCode !== 0) {
		fatal(`bun install failed in ai submodule (exit ${installCode})`);
	}

	log("syncing ai skills");
	const syncCode = shInherit("bun", ["sync"], { cwd: aiDir });
	if (syncCode !== 0) {
		fatal(`bun sync failed in ai submodule (exit ${syncCode})`);
	}
}

export async function cmdSetup(): Promise<RegistryEntry> {
	if (process.env.NODE_ENV === "production") {
		fatal("bun dw is disabled in production");
	}

	// Fresh Conductor/Superset worktrees have no node_modules; drizzle-kit needs tsx.
	// Bun is fast no-op when lockfile matches installed tree.
	log("ensuring deps installed (bun install)");
	const installCode = shInherit("bun", ["install"], { cwd: PROJECT_ROOT });
	if (installCode !== 0) fatal(`bun install failed (exit ${installCode})`);

	ensureAiSubmoduleSynced();

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
