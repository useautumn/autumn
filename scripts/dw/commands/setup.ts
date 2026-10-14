import { isCloudAgent } from "@autumn/env";
import { NEON_PROJECT_ID, PROJECT_ROOT } from "../constants.ts";
import { ensurePublicAccess } from "../helpers/cloudflare.ts";
import { isProvisioned } from "../helpers/entry.ts";
import { getCurrentWorktree } from "../helpers/git.ts";
import { cmdStart } from "./start.ts";
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
		log(`WARNING: ai submodule unavailable (exit ${submoduleCode})`);
		log("WARNING: run `bun ai/src/cli.ts sync` once the checkout succeeds");
		return;
	}

	log("ensuring ai deps installed (bun install)");
	const installCode = shInherit("bun", ["install"], { cwd: aiDir });
	if (installCode !== 0) {
		fatal(`bun install failed in ai submodule (exit ${installCode})`);
	}

	log("syncing ai skills");
	const syncArgs = ["ai/src/cli.ts", "sync"];
	if (isCloudAgent()) syncArgs.push("--copy");
	const syncCode = shInherit("bun", syncArgs, {
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
	} else if (isCloudAgent()) {
		return await cmdStart();
	} else {
		entry = await ensurePublicAccess(entry);
	}

	return entry;
}
