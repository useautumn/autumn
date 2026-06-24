import { tmuxServerSession } from "../constants.ts";
import { listVms, removeVm } from "../helpers/exe.ts";
import { removeMarker } from "../helpers/marker.ts";
import { deleteSwBranch, listSwBranchNames } from "../helpers/neon.ts";
import { getEntry, loadRegistry, removeEntry } from "../helpers/registry.ts";
import { log, sh, shInherit } from "../helpers/shell.ts";

/** Delete exe.dev VMs + Neon branches that sw created but the registry forgot
 * (e.g. an interrupted `bun sw` that died before recording the entry). */
function teardownOrphans(): void {
	const entries = Object.values(loadRegistry());
	const knownVms = new Set(entries.map((e) => e.vmName).filter(Boolean));
	const knownBranches = new Set(
		entries.map((e) => e.neonBranchName).filter(Boolean),
	);

	let removed = 0;
	for (const vm of listVms()) {
		if (vm.name.startsWith("sw-") && !knownVms.has(vm.name)) {
			removeVm(vm.name);
			removed++;
		}
	}
	for (const name of listSwBranchNames()) {
		if (!knownBranches.has(name)) {
			deleteSwBranch(name);
			removed++;
		}
	}
	log(removed ? `removed ${removed} orphan(s)` : "no orphans found");
}

/**
 * Tear down a worktree's stack. Remote: delete the exe.dev VM + Neon branch.
 * Local: defer to `bun dw teardown` and kill the server tmux. `--orphans` sweeps
 * sw-created VMs/branches with no registry entry. Defaults to the current worktree.
 * Leaves the git worktree itself untouched — removal stays a herdr/git action.
 */
export async function cmdTeardown({
	path,
	orphans,
}: {
	path?: string;
	orphans?: boolean;
}): Promise<void> {
	if (orphans) {
		teardownOrphans();
		return;
	}

	const target = path ?? process.cwd();
	const entry = getEntry(target);
	if (!entry) {
		log(`no sw entry for ${target}`);
		return;
	}

	if (entry.target === "local") {
		shInherit("bun", ["run", "dw:teardown"], { cwd: entry.path });
		sh("tmux", ["kill-session", "-t", tmuxServerSession(entry.slug)]);
	} else {
		if (entry.vmName) removeVm(entry.vmName);
		if (entry.neonBranchName) deleteSwBranch(entry.neonBranchName);
		removeMarker(entry.path);
	}

	removeEntry(entry.path);
	log(`tore down ${entry.branch} (${entry.target})`);
}
