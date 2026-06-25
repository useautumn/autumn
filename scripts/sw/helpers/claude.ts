import { log, sh } from "./shell.ts";
import { SSH_OPTS } from "./ssh.ts";

/**
 * Copy the Mac's Claude Code OAuth credential (stored in the login Keychain) to
 * the box's `~/.claude/.credentials.json`, so claude is already logged in there.
 * The secret is piped Keychain → ssh → box file (never written to disk on the
 * Mac). Best-effort: no-op off macOS or if the credential isn't found.
 */
export function installClaudeCredential(sshDest: string): void {
	if (process.platform !== "darwin") return;
	const cred = sh("security", [
		"find-generic-password",
		"-s",
		"Claude Code-credentials",
		"-w",
	]);
	if (cred.code !== 0 || !cred.stdout) {
		log("no claude credential in Keychain — run `claude` on the box to log in");
		return;
	}
	const res = sh(
		"ssh",
		[
			...SSH_OPTS,
			sshDest,
			"mkdir -p ~/.claude && umask 077 && cat > ~/.claude/.credentials.json",
		],
		{ stdin: cred.stdout },
	);
	if (res.code === 0) {
		log("copied your claude login to the box");
	} else {
		log(`copying claude login failed: ${res.stderr || res.stdout}`);
	}
}
