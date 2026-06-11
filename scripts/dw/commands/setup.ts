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
	setupAgentWorktree,
	autoSetupTestOrg,
	autoSeedSlackInstall,
} from "../helpers/setup.ts";
import { ensureChatDatabase } from "../helpers/neon.ts";
import { promoteAllUsersToAdmin } from "./admin.ts";
import { ensureComposeStack, readNgrokTunnelUrl } from "../helpers/compose.ts";
import { ensureReservedDomain, ngrokApiAvailable } from "../helpers/ngrok.ts";
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

		// Leaf's chat-sdk uses a separate `chat` DB on the same branch.
		if (entry.branchName) ensureChatDatabase(entry.branchName);

		// Reserve a stable per-worktree ngrok domain (create-on-setup). The agent
		// binds it via --url, so the URL survives `bun d` restarts and can't be
		// stolen by an eval's random tunnel. Released on teardown.
		let reservedDomain: string | undefined;
		if (ngrokApiAvailable() && process.env.NGROK_AUTHTOKEN) {
			const reserved = await ensureReservedDomain(
				entry.worktreeNum,
				entry.path,
			);
			entry.reservedDomainId = reserved.id;
			entry.ngrokUrl = `https://${reserved.domain}`;
			reservedDomain = reserved.domain;
			registry[cwd] = entry;
			saveRegistry(registry);
		}

		const { ngrokEnabled } = ensureComposeStack(
			entry.worktreeNum,
			reservedDomain,
		);
		// Random-domain fallback (no NGROK_API_KEY): read the URL back from the
		// local ngrok API since it isn't deterministic.
		if (ngrokEnabled && !reservedDomain) {
			entry.ngrokUrl = await readNgrokTunnelUrl(entry.worktreeNum);
			registry[cwd] = entry;
			saveRegistry(registry);
		}

		writeEnvLocalFiles(entry);
		await autoSetupTestOrg(entry);
		// Seed the Slack install for the worktree's test org (needs SLACK_BOT_TOKEN).
		await autoSeedSlackInstall(entry);
		// Auto-grant local superuser, like `bun dw admin` — runs after the test org
		// exists so there are users to promote. Non-fatal: a hiccup here shouldn't
		// undo an otherwise-complete setup.
		if (entry.databaseUrl) {
			try {
				promoteAllUsersToAdmin(entry.databaseUrl);
			} catch (err) {
				log(
					`admin promotion skipped: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		}
		ensureEmulateRunning();
	}

	return entry;
}
