import { getCurrentWorktree } from "../helpers/git.ts";
import { killOwnPorts } from "../helpers/ports.ts";
import { loadRegistry } from "../helpers/registry.ts";
import { fatal } from "../helpers/shell.ts";
import { startDev } from "../helpers/start.ts";

export async function cmdRun(): Promise<void> {
	if (process.env.NODE_ENV === "production") {
		fatal("bun dw is disabled in production");
	}

	const cwd = getCurrentWorktree();
	const registry = loadRegistry();
	const entry = registry[cwd];
	if (!entry) {
		fatal(
			`no provisioned worktree at ${cwd}. Run 'bun dw setup' first (or 'bun dw' to do both).`,
		);
	}

	killOwnPorts(entry.worktreeNum);
	startDev(entry, { allowTmux: false });
}
