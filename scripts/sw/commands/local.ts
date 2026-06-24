import { execForeground } from "../helpers/exec.ts";
import { layoutPanes } from "../helpers/layout.ts";
import { upsertEntry } from "../helpers/registry.ts";
import { fatal, log, shInherit } from "../helpers/shell.ts";
import { serverTmuxScript } from "../helpers/tmux.ts";
import type { WorktreeContext } from "../types.ts";

/**
 * Local target: provision via `bun dw` (Neon branch + goaws/Dragonfly compose +
 * env), lay out the claude pane, and hand this pane to the dev server in a
 * status-less tmux session.
 */
export function cmdLocal({ checkout, branch, slug }: WorktreeContext): void {
	log(`provisioning local stack for ${branch}`);
	const code = shInherit("bun", ["run", "dw:setup"], { cwd: checkout });
	if (code !== 0) fatal("`bun dw setup` failed");

	upsertEntry({
		path: checkout,
		branch,
		slug,
		target: "local",
		createdAt: Date.now(),
	});

	const self = process.env.HERDR_PANE_ID;
	if (self) layoutPanes(self);

	const script = serverTmuxScript({
		slug,
		dir: checkout,
		runCmd: "bun run dw:run",
	});
	execForeground("bash", ["-lc", script]);
}
