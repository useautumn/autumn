import { tmuxServerSession } from "../constants.ts";

/**
 * A bash snippet that idempotently runs the dev server in a status-less,
 * attach-or-create tmux session, then attaches the current pane to it. `new -A`
 * semantics: reconnecting (next day / after herdr restart) re-attaches the
 * still-running server instead of starting a second one. Agents read it without
 * attaching via `tmux capture-pane -pt <slug>-dev`.
 *
 * Identical on the Mac (local, via `bash -lc`) and the devbox (remote, via ssh),
 * so resume behaves the same in both.
 */
export function serverTmuxScript({
	slug,
	dir,
	runCmd,
}: {
	slug: string;
	dir: string;
	runCmd: string;
}): string {
	const session = tmuxServerSession(slug);
	return [
		`if ! tmux has-session -t ${session} 2>/dev/null; then`,
		`  tmux new-session -d -s ${session} -c '${dir}' 'exec ${runCmd}';`,
		`  tmux set-option -t ${session} status off;`,
		`fi;`,
		`exec tmux attach -t ${session}`,
	].join("\n");
}
