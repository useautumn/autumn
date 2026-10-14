import {
	LOCAL_DATABASE_URL,
	NEON_TEMPLATE_BRANCH,
	PROJECT_ROOT,
} from "../constants.ts";
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

export function localTestOrgEnv(): Record<string, string> {
	return {
		...(process.env as Record<string, string>),
		DATABASE_URL: LOCAL_DATABASE_URL,
		DATABASE_CRITICAL_URL: LOCAL_DATABASE_URL,
		AUTUMN_DB_DIRECT: "1",
	};
}

export function cloudSeedMissingStripeKey({
	stripeSandboxSecretKey = process.env.STRIPE_SANDBOX_SECRET_KEY,
}: {
	stripeSandboxSecretKey?: string;
} = {}): boolean {
	return !stripeSandboxSecretKey?.trim();
}

export async function autoEnsureLocalTestOrg(): Promise<void> {
	if (cloudSeedMissingStripeKey()) {
		fatal(
			"STRIPE_SANDBOX_SECRET_KEY unset — Cloud start must pull it from Infisical before seeding unit-test-org",
		);
	}
	log("ensuring unit-test-org in local postgres");
	const code = shInherit(
		"bun",
		["scripts/setup/setup-test.ts", "--ensure"],
		{
			cwd: PROJECT_ROOT,
			env: localTestOrgEnv(),
		},
	);
	if (code !== 0) {
		fatal(`setup-test --ensure exited with code ${code}`);
	}
}

function worktreeDbEnv(entry: RegistryEntry): Record<string, string> {
	return {
		...(process.env as Record<string, string>),
		DATABASE_URL: entry.databaseUrl!,
		DATABASE_CRITICAL_URL: entry.databaseUrl!,
	};
}

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
