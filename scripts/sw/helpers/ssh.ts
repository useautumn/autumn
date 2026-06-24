/**
 * Shared ssh options for every connection sw makes. ControlMaster multiplexes all
 * ssh/scp/git calls over ONE connection (auth/passphrase once per ~5 min instead
 * of per-command); accept-new skips the host-key prompt for fresh boxes.
 */
export const SSH_OPTS = [
	"-o",
	"ControlMaster=auto",
	"-o",
	"ControlPath=/tmp/sw-cm-%C",
	"-o",
	"ControlPersist=300",
	"-o",
	"StrictHostKeyChecking=accept-new",
];

/** Same options as a single string, for `GIT_SSH_COMMAND`. */
export const SSH_OPTS_STR = `ssh ${SSH_OPTS.join(" ")}`;

const KEEPALIVE = [
	"-o",
	"ServerAliveInterval=30",
	"-o",
	"ServerAliveCountMax=3",
];

/** argv for `ssh -t … host <remoteCmd>` — used to hand a pane to a remote process. */
export function sshExecArgs(host: string, remoteCmd: string): string[] {
	return ["-t", ...SSH_OPTS, ...KEEPALIVE, host, remoteCmd];
}
