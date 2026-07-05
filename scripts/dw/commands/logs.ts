import { resolveAgentEntryOrFatal } from "../helpers/registry.ts";
import {
	ensureTmuxInstalled,
	tmuxSessionExists,
	tmuxSessionName,
} from "../helpers/tmux.ts";

export function cmdLogs(): void {
	const entry = resolveAgentEntryOrFatal("logs");
	const name = tmuxSessionName(entry.worktreeNum);
	ensureTmuxInstalled();
	if (!tmuxSessionExists(name)) {
		console.log(`(no tmux session for ${name})`);
		process.exit(0);
	}
	const proc = Bun.spawn(
		["tmux", "capture-pane", "-t", name, "-p", "-S", "-2000"],
		{ stdout: "inherit", stderr: "inherit" },
	);
	proc.exited.then((code) => process.exit(code ?? 0));
}
