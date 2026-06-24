import { execForeground, realShell } from "../helpers/exec.ts";
import { currentBranch, slugFromBranch } from "../helpers/git.ts";
import { pick } from "../helpers/picker.ts";
import { log } from "../helpers/shell.ts";
import type { Target } from "../types.ts";
import { cmdLocal } from "./local.ts";
import { cmdRemote } from "./remote.ts";

/**
 * The picker the herdr plugin injects into a new @autumn worktree's first pane.
 * Runs in the worktree's local checkout (its cwd), so the marker is absent and
 * this pane is a plain local shell — correct for an interactive prompt.
 */
export async function cmdPick(): Promise<void> {
	const checkout = process.cwd();
	const branch = currentBranch(checkout);
	const slug = slugFromBranch(branch);

	const choice = await pick<Exclude<Target, "modal">>({
		title: `set up worktree '${branch}'  ↓↑ + enter`,
		options: [
			{ value: "local", label: "Local", hint: "bun dw on this machine" },
			{
				value: "exe",
				label: "exe.dev",
				hint: "remote devbox · native services · sticky",
			},
		],
		envOverride: "SW_TARGET",
	});

	if (!choice) {
		log("cancelled — dropping into a shell");
		execForeground(realShell(), ["-l"], { cwd: checkout });
	}

	const context = { checkout, branch, slug };
	if (choice === "local") {
		cmdLocal(context);
	} else {
		await cmdRemote({ ...context, target: choice });
	}
}
