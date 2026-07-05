import { NEON_PROJECT_ID, PROJECT_ROOT } from "../constants.ts";
import { isProvisioned } from "../helpers/entry.ts";
import {
	getCanonicalWorktree,
	getCurrentBranch,
	getCurrentWorktree,
	getDefaultBranch,
} from "../helpers/git.ts";
import { withNeonContext } from "../helpers/neonContext.ts";
import {
	parseRegionArg,
	resolveNeonRegionForSetup,
} from "../helpers/neonRegion.ts";
import { provisionWorktree } from "../helpers/provision.ts";
import {
	allocateWorktreeNumber,
	deriveBranchName,
	deriveCanonicalBranchName,
	loadRegistry,
	reconcile,
	refreshCanonicalEntry,
	saveRegistry,
	wantsCanonicalProvision,
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
	const syncCode = shInherit("bun", ["sync"], { cwd: aiDir });
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

	const canonical = getCanonicalWorktree();
	const cwd = getCurrentWorktree();
	const gitBranch = getCurrentBranch();
	const defaultBranch = getDefaultBranch();
	let registry = loadRegistry();
	registry = reconcile(registry);

	let entry = registry[cwd];
	if (!entry) {
		const worktreeNum = allocateWorktreeNumber(cwd, registry, canonical);
		const onFeatureBranch = wantsCanonicalProvision(
			cwd,
			canonical,
			gitBranch,
			defaultBranch,
		);
		const branchName =
			worktreeNum === 1
				? onFeatureBranch
					? deriveCanonicalBranchName(cwd, gitBranch)
					: undefined
				: deriveBranchName(cwd, worktreeNum);
		entry = {
			path: cwd,
			worktreeNum,
			createdAt: Date.now(),
			...(onFeatureBranch && { gitBranch }),
			...(branchName && { branchName }),
		};
		registry[cwd] = entry;
		saveRegistry(registry);
		log(`registered ${cwd} as worktree ${worktreeNum}`);
	} else if (entry.worktreeNum === 1) {
		entry = refreshCanonicalEntry(entry, cwd, canonical);
		registry[cwd] = entry;
		saveRegistry(registry);
	} else {
		entry.lastUsedAt = Date.now();
		registry[cwd] = entry;
		saveRegistry(registry);
	}

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
	}

	return entry;
}
