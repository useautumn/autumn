import { tmuxServerSession } from "../constants.ts";
import { removeVm } from "../helpers/exe.ts";
import { deleteSwBranch } from "../helpers/neon.ts";
import { getEntry, removeEntry } from "../helpers/registry.ts";
import { log, sh, shInherit } from "../helpers/shell.ts";

/**
 * Tear down a worktree's stack. Remote: delete the exe.dev VM + Neon branch.
 * Local: defer to `bun dw teardown` and kill the server tmux. Defaults to the
 * current worktree (cwd) when no path is given. Leaves the git worktree itself
 * untouched — removal stays a deliberate herdr/git action.
 */
export async function cmdTeardown({ path }: { path?: string }): Promise<void> {
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
	}

	removeEntry(entry.path);
	log(`tore down ${entry.branch} (${entry.target})`);
}
