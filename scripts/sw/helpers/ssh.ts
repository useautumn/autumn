const KEEPALIVE = [
	"-o",
	"ServerAliveInterval=30",
	"-o",
	"ServerAliveCountMax=3",
];

const shQuote = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`;

/** argv for `ssh -t … host <remoteCmd>` — used to hand a pane to a remote process. */
export function sshExecArgs(host: string, remoteCmd: string): string[] {
	return ["-t", ...KEEPALIVE, host, remoteCmd];
}

/**
 * A single shell command line that ssh's into the box and runs `remoteCmd` — for
 * typing into a pane via `herdr pane run`. Visual agent-status works over plain
 * ssh (herdr reads the rendered PTY), so no socket bridge is needed here.
 */
export function sshShellCommand(host: string, remoteCmd: string): string {
	return `ssh -t ${KEEPALIVE.join(" ")} ${host} ${shQuote(remoteCmd)}`;
}
