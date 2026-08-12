import { NEON_TEMPLATE_BRANCH, PROJECT_ROOT } from "../constants.ts";
import type { RegistryEntry } from "../types.ts";
import {
	applyCommittedMigrations,
	loadDbFunctions,
} from "./migration.ts";
import { hasPendingMigrations } from "./migrationStatus.ts";
import {
	connectionString,
	createBranch,
	ensureTemplateBranch,
	findBranchByName,
} from "./neon.ts";
import { saveRegistry } from "./registry.ts";
import { fatal, log, shInherit } from "./shell.ts";

export async function setupAgentWorktree(
	entry: RegistryEntry,
	registry: Record<string, RegistryEntry>,
): Promise<{ entry: RegistryEntry; created: boolean }> {
	const { branchName } = entry;
	if (!branchName) fatal("entry missing branchName");

	const existing = findBranchByName(branchName);

	if (existing) {
		const directUrl = connectionString(branchName, { pooled: false });
		if (await hasPendingMigrations(directUrl)) {
			log(`branch ${branchName} schema incomplete — applying migrations`);
			applyCommittedMigrations(branchName, directUrl);
			loadDbFunctions(branchName, directUrl);
		}
		const url = connectionString(branchName, { pooled: true });
		const next: RegistryEntry = {
			...entry,
			branchId: existing.id,
			databaseUrl: url,
			lastUsedAt: Date.now(),
		};
		registry[entry.path] = next;
		saveRegistry(registry);
		return { entry: next, created: false };
	}

	if (entry.branchId || entry.databaseUrl) {
		log(`neon branch ${branchName} missing — re-provisioning`);
	}

	// First-run (or recreate after teardown).
	log(`first run for ${branchName} — provisioning neon branch`);
	ensureTemplateBranch();
	const branch = createBranch(branchName, NEON_TEMPLATE_BRANCH);
	const directUrl = connectionString(branchName, { pooled: false });
	applyCommittedMigrations(branchName, directUrl);
	loadDbFunctions(branchName, directUrl);
	const pooledUrl = connectionString(branchName, { pooled: true });
	const next: RegistryEntry = {
		...entry,
		branchId: branch.id,
		databaseUrl: pooledUrl,
		lastUsedAt: Date.now(),
	};
	registry[entry.path] = next;
	saveRegistry(registry);
	return { entry: next, created: true };
}

function worktreeDbEnv(entry: RegistryEntry): Record<string, string> {
	return {
		...(process.env as Record<string, string>),
		DATABASE_URL: entry.databaseUrl!,
		DATABASE_CRITICAL_URL: entry.databaseUrl!,
	};
}

// Full seed: org + features/products + API key. First Neon branch create only.
export async function autoSetupTestOrg(entry: RegistryEntry): Promise<void> {
	if (!entry.databaseUrl) {
		fatal("autoSetupTestOrg: no databaseUrl on entry");
	}
	log(`seeding unit test org in ${entry.branchName ?? "worktree"}`);
	const code = shInherit("bun", ["scripts/setup/setup-test.ts", "--yes"], {
		cwd: PROJECT_ROOT,
		env: worktreeDbEnv(entry),
	});
	if (code !== 0) {
		fatal(`setup-test exited with code ${code}`);
	}
}

// Cheap idempotent ensure: Infisical/env secret hash ∈ this worktree's api_keys,
// and refresh SECRET+PUBLIC in server/.env.local if that file already exists
// (writeEnvLocalFiles runs first). Never creates .env.local for bun d.
export async function autoEnsureTestOrgSecretKey(
	entry: RegistryEntry,
): Promise<void> {
	if (!entry.databaseUrl) {
		fatal("autoEnsureTestOrgSecretKey: no databaseUrl on entry");
	}
	log(
		`ensuring unit-test-org API key in ${entry.branchName ?? "worktree"}`,
	);
	const code = shInherit(
		"bun",
		["scripts/setup/setup-test.ts", "--ensure-key"],
		{
			cwd: PROJECT_ROOT,
			env: worktreeDbEnv(entry),
		},
	);
	if (code !== 0) {
		fatal(`ensure-test-org-key exited with code ${code}`);
	}
}

// Seed the Slack `chat_installations` row (+ OAuth creds) for the worktree's test
// org so the dev Slack app works without a manual OAuth install per worktree.
// Needs SLACK_BOT_TOKEN (the app's Bot User OAuth Token). SLACK_CLIENT_ID /
// SLACK_CLIENT_SECRET configure OAuth, but cannot mint a bot token without an
// install callback code; skips otherwise.
// Non-fatal (Slack token may be absent in some environments).
export async function autoSeedSlackInstall(
	entry: RegistryEntry,
): Promise<void> {
	if (!entry.databaseUrl) {
		log("autoSeedSlackInstall: no databaseUrl on entry, skipping");
		return;
	}
	if (!process.env.SLACK_BOT_TOKEN) {
		log(
			"autoSeedSlackInstall: SLACK_BOT_TOKEN not set, skipping (client id/secret are not enough to seed an installed bot)",
		);
		return;
	}
	log(`seeding slack installation in ${entry.branchName ?? "worktree"}`);
	const code = shInherit("bun", ["apps/leaf/scripts/seedSlackInstall.ts"], {
		cwd: PROJECT_ROOT,
		env: {
			...(process.env as Record<string, string>),
			DATABASE_URL: entry.databaseUrl,
			DATABASE_CRITICAL_URL: entry.databaseUrl,
		},
	});
	if (code !== 0) {
		console.error(`[dw] seedSlackInstall exited with code ${code}; continuing`);
	}
}
