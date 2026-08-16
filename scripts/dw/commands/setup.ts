import { NEON_PROJECT_ID, PROJECT_ROOT } from "../constants.ts";
import { isProvisioned } from "../helpers/entry.ts";
import { getCurrentWorktree } from "../helpers/git.ts";
import { isHeadless } from "../helpers/headless.ts";
import { ensureLocalInfra } from "../helpers/localInfra.ts";
import { ensureNgrok } from "../helpers/ngrok.ts";
import { withNeonContext } from "../helpers/neonContext.ts";
import {
	parseRegionArg,
	resolveNeonRegionForSetup,
} from "../helpers/neonRegion.ts";
import { provisionWorktree } from "../helpers/provision.ts";
import {
	loadRegistry,
	registerCurrentWorktree,
	saveRegistry,
} from "../helpers/registry.ts";
import { fatal, log, shInherit } from "../helpers/shell.ts";
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
	// Full sync everywhere: syncMcps now drops the cloud-root servers instead of
	// aborting, so headless boxes get .mcp.json too. `sync devin` skipped it and
	// left cloud workspaces with skills but no MCP servers.
	// Run from the autumn root so findRepoRoot sees workspaces and writes
	// into .cursor/ at the repo root — not into ai/.cursor (the TTY-less
	// fallback when cwd is ai/).
	const syncCode = shInherit("bun", ["ai/src/cli.ts", "sync"], {
		cwd: PROJECT_ROOT,
	});
	if (syncCode !== 0) {
		fatal(`bun sync failed in ai submodule (exit ${syncCode})`);
	}
}

export async function cmdSetup(): Promise<RegistryEntry> {
	if (process.env.NODE_ENV === "production") {
		fatal("bun dw is disabled in production");
	}

	log("ensuring deps installed (bun install)");
	const installCode = shInherit("bun", ["install"], { cwd: PROJECT_ROOT });
	if (installCode !== 0) fatal(`bun install failed (exit ${installCode})`);

	ensureAiSubmoduleSynced();

	const cwd = getCurrentWorktree();
	let entry = registerCurrentWorktree();
	let registry = loadRegistry();

	log(
		`resuming worktree ${entry.worktreeNum}${entry.branchName ? ` (${entry.branchName})` : ""}`,
	);

	if (isProvisioned(entry)) {
		const regionArg = parseRegionArg(process.argv);
		const neonCtx = resolveNeonRegionForSetup({ regionArg, entry });
		entry = {
			...entry,
			...(neonCtx.regionId && { neonRegion: neonCtx.regionId }),
			...(neonCtx.projectId !== NEON_PROJECT_ID && {
				neonProjectId: neonCtx.projectId,
			}),
		};
		registry[cwd] = entry;
		saveRegistry(registry);

		entry = await withNeonContext(
			neonCtx.projectId === NEON_PROJECT_ID ? undefined : neonCtx,
			() => provisionWorktree({ entry, registry, cwd }),
		);
		registry[cwd] = entry;
		saveRegistry(registry);
	} else if (isHeadless()) {
		ensureLocalInfra();
		entry = await ensureNgrok(entry);
		registry[cwd] = entry;
		saveRegistry(registry);
	} else {
		entry = await ensureNgrok(entry);
	}

	return entry;
}
