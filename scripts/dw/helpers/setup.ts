import { log, fatal, shInherit } from "./shell.ts";
import {
	ensureTemplateBranch,
	createBranch,
	connectionString,
	findBranchByName,
} from "./neon.ts";
import { applyCommittedMigrations, loadDbFunctions } from "./migration.ts";
import { loadRegistry, saveRegistry } from "./registry.ts";
import { PROJECT_ROOT, NEON_TEMPLATE_BRANCH } from "../constants.ts";
import type { RegistryEntry } from "../types.ts";

export async function setupAgentWorktree(
	entry: RegistryEntry,
	registry: Record<string, RegistryEntry>,
): Promise<RegistryEntry> {
	const { branchName } = entry;
	if (!branchName) fatal("entry missing branchName");

	// If branch already exists on Neon and we have a URL, just refresh.
	if (entry.branchId && findBranchByName(branchName)) {
		const url = connectionString(branchName, { pooled: true });
		const next: RegistryEntry = {
			...entry,
			databaseUrl: url,
			lastUsedAt: Date.now(),
		};
		registry[entry.path] = next;
		saveRegistry(registry);
		return next;
	}

	// First-run provisioning.
	log(`first run for ${branchName} — provisioning neon branch`);
	ensureTemplateBranch();
	const branch = createBranch(branchName, NEON_TEMPLATE_BRANCH);
	// Use direct (non-pooled) URL for DDL; pooler can interfere with some DDL paths.
	const directUrl = connectionString(branchName, { pooled: false });
	applyCommittedMigrations(branchName, directUrl);
	loadDbFunctions(branchName, directUrl);
	// Pooled URL for runtime.
	const pooledUrl = connectionString(branchName, { pooled: true });
	const next: RegistryEntry = {
		...entry,
		branchId: branch.id,
		databaseUrl: pooledUrl,
		lastUsedAt: Date.now(),
	};
	registry[entry.path] = next;
	saveRegistry(registry);
	return next;
}

// Auto-seed unit test org into the per-worktree Neon branch.
// setup-test is idempotent so we always invoke it on dw default;
// failures are non-fatal (log + continue) since downstream dev
// might still be useful without the seed.
export async function autoSetupTestOrg(entry: RegistryEntry): Promise<void> {
	if (!entry.databaseUrl) {
		log("autoSetupTestOrg: no databaseUrl on entry, skipping");
		return;
	}
	log(`seeding unit test org in ${entry.branchName ?? "worktree"}`);
	const code = shInherit(
		"bun",
		["scripts/setup/setup-test.ts", "--yes"],
		{
			cwd: PROJECT_ROOT,
			env: {
				...(process.env as Record<string, string>),
				DATABASE_URL: entry.databaseUrl,
				DATABASE_CRITICAL_URL: entry.databaseUrl,
			},
		},
	);
	if (code !== 0) {
		console.error(`[dw] setup-test exited with code ${code}; continuing`);
	}
}

// Seed the Slack `chat_installations` row (+ OAuth creds) for the worktree's test
// org so the dev Slack app works without a manual OAuth install per worktree.
// Needs SLACK_BOT_TOKEN (the app's Bot User OAuth Token); skips otherwise.
// Non-fatal, like autoSetupTestOrg.
export async function autoSeedSlackInstall(entry: RegistryEntry): Promise<void> {
	if (!entry.databaseUrl) {
		log("autoSeedSlackInstall: no databaseUrl on entry, skipping");
		return;
	}
	if (!process.env.SLACK_BOT_TOKEN) {
		log("autoSeedSlackInstall: SLACK_BOT_TOKEN not set, skipping");
		return;
	}
	log(`seeding slack installation in ${entry.branchName ?? "worktree"}`);
	const code = shInherit(
		"bun",
		["apps/leaf/scripts/seedSlackInstall.ts"],
		{
			cwd: PROJECT_ROOT,
			env: {
				...(process.env as Record<string, string>),
				DATABASE_URL: entry.databaseUrl,
				DATABASE_CRITICAL_URL: entry.databaseUrl,
			},
		},
	);
	if (code !== 0) {
		console.error(`[dw] seedSlackInstall exited with code ${code}; continuing`);
	}
}
