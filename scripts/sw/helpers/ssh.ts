import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { SW_AGENT_SOCK } from "../constants.ts";
import { sh, shInherit } from "./shell.ts";

/** ssh-add -l exit codes: 0 = has keys, 1 = agent up but empty, 2 = no agent. */
function agentReachable(sock: string): boolean {
	return (
		sh("ssh-add", ["-l"], {
			env: { ...(process.env as Record<string, string>), SSH_AUTH_SOCK: sock },
		}).code !== 2
	);
}

/**
 * Point ssh at a sw-managed agent (fixed socket) and load the key once, so EVERY
 * ssh — provisioning, branch push, and every pane opened later via the wrapper —
 * authenticates without a passphrase. herdr panes often have no reachable agent of
 * their own, so we run our own persistent one. On macOS the passphrase is stored
 * in the Keychain, so the single prompt only ever happens the first time.
 */
export function ensureSshKeyLoaded(): void {
	if (!agentReachable(SW_AGENT_SOCK)) {
		rmSync(SW_AGENT_SOCK, { force: true });
		mkdirSync(dirname(SW_AGENT_SOCK), { recursive: true });
		sh("ssh-agent", ["-a", SW_AGENT_SOCK]); // starts a detached agent on the socket
	}
	process.env.SSH_AUTH_SOCK = SW_AGENT_SOCK;
	if (sh("ssh-add", ["-l"]).code === 0) return; // already holds a key
	shInherit(
		"ssh-add",
		process.platform === "darwin" ? ["--apple-use-keychain"] : [],
	);
}

/**
 * Shared ssh options for every connection sw makes. ControlMaster multiplexes all
 * ssh/scp/git calls over ONE connection; accept-new skips the host-key prompt for
 * fresh boxes.
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
	"-o",
	"AddKeysToAgent=yes",
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
