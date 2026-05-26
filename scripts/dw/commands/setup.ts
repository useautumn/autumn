import { fatal, log, shInherit } from "../helpers/shell.ts";
import { getCanonicalWorktree, getCurrentWorktree } from "../helpers/git.ts";
import {
	loadRegistry,
	saveRegistry,
	reconcile,
	allocateWorktreeNumber,
	deriveBranchName,
} from "../helpers/registry.ts";
import {
	provisionNeonBranch,
	applyMigrationsAndFunctions,
	autoSetupTestOrg,
} from "../helpers/setup.ts";
import { ensureComposeStack } from "../helpers/compose.ts";
import { writeEnvLocalFiles } from "../helpers/env-files.ts";
import { ensureEmulateRunning } from "../helpers/emulate.ts";
import { PROJECT_ROOT } from "../constants.ts";
import type { RegistryEntry } from "../types.ts";

export async function cmdSetup(): Promise<RegistryEntry> {
	if (process.env.NODE_ENV === "production") {
		fatal("bun dw is disabled in production");
	}

	// Fresh Conductor/Superset worktrees have no node_modules; drizzle-kit needs tsx.
	// Bun is fast no-op when lockfile matches installed tree.
	log("ensuring deps installed (bun install)");
	const installCode = shInherit("bun", ["install"], { cwd: PROJECT_ROOT });
	if (installCode !== 0) fatal(`bun install failed (exit ${installCode})`);

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
		// Order matters: provision branch → write .env.local → apply migrations.
		// If migrations fail, .env.local already points at the half-migrated
		// branch so the user can recover with `bun dw reset` (or manually
		// re-run `bun db migrate --bootstrap` once the underlying issue is fixed).
		entry = await provisionNeonBranch(entry, registry);
		ensureComposeStack(entry.worktreeNum);
		writeEnvLocalFiles(entry);
		applyMigrationsAndFunctions(entry);
		await autoSetupTestOrg(entry);
		ensureEmulateRunning();
	}

	return entry;
}
