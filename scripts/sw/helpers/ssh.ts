const KEEPALIVE = [
	"-o",
	"ServerAliveInterval=30",
	"-o",
	"ServerAliveCountMax=3",
];

/** argv for `ssh -t … host <remoteCmd>` — used to hand a pane to a remote process. */
export function sshExecArgs(host: string, remoteCmd: string): string[] {
	return ["-t", ...KEEPALIVE, host, remoteCmd];
}
