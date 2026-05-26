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

/**
 * Step 1 of agent-worktree setup: create the Neon branch and persist its
 * pooled URL onto the entry. Cheap and idempotent — does NOT touch schema.
 * Splitting this out from migration application means cmdSetup can write
 * .env.local *before* migrations run, so a migration failure leaves the
 * worktree in a recoverable state (`bun db migrate` / `bun dw reset` work).
 */
export async function provisionNeonBranch(
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

	log(`first run for ${branchName} — provisioning neon branch`);
	ensureTemplateBranch();
	const branch = createBranch(branchName, NEON_TEMPLATE_BRANCH);
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

/**
 * Step 2 of agent-worktree setup: apply committed migrations + load DB
 * functions. Idempotent on resume — drizzle's migration ledger skips
 * already-applied migrations. Uses the direct (non-pooled) URL for DDL
 * because Neon's pooler can interfere with DDL paths.
 */
export function applyMigrationsAndFunctions(entry: RegistryEntry): void {
	const { branchName } = entry;
	if (!branchName) fatal("entry missing branchName");
	const directUrl = connectionString(branchName, { pooled: false });
	applyCommittedMigrations(branchName, directUrl);
	loadDbFunctions(branchName, directUrl);
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
