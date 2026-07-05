import { resolveAgentEntryOrFatal } from "../helpers/registry.ts";
import { fatal } from "../helpers/shell.ts";
import {
	ensureTmuxInstalled,
	tmuxSessionExists,
	tmuxSessionName,
} from "../helpers/tmux.ts";

export function cmdAttach(): void {
	const entry = resolveAgentEntryOrFatal("attach");
	const name = tmuxSessionName(entry.worktreeNum);
	ensureTmuxInstalled();
	if (!tmuxSessionExists(name)) {
		fatal(`no tmux session for ${name}, run 'bun dw' first`);
	}
	const proc = Bun.spawn(["tmux", "attach", "-t", name], {
		stdin: "inherit",
		stdout: "inherit",
		stderr: "inherit",
	});
	proc.exited.then((code) => process.exit(code ?? 0));
}
