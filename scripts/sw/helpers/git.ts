import { basename } from "node:path";
import { fatal, sh } from "./shell.ts";

export function currentBranch(checkoutPath: string): string {
	const res = sh("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
		cwd: checkoutPath,
	});
	if (res.code !== 0) fatal(`could not read branch at ${checkoutPath}`);
	// Detached worktree → use the worktree dir name instead of literal "HEAD".
	return res.stdout && res.stdout !== "HEAD"
		? res.stdout
		: basename(checkoutPath);
}

/** A filesystem/tmux-safe slug from a branch name (`fix/foo-bar` → `fix-foo-bar`). */
export function slugFromBranch(branch: string): string {
	return branch
		.replace(/[^a-zA-Z0-9-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.toLowerCase();
}

/** Push the branch so a devbox can fetch it. Idempotent; sets upstream. */
export function pushBranch(checkoutPath: string, branch: string): void {
	const res = sh("git", ["push", "-u", "origin", branch], {
		cwd: checkoutPath,
	});
	if (res.code !== 0) {
		fatal(`git push of ${branch} failed: ${res.stderr || res.stdout}`);
	}
}

export function originUrl(checkoutPath: string): string {
	const res = sh("git", ["remote", "get-url", "origin"], { cwd: checkoutPath });
	if (res.code !== 0) fatal(`no origin remote at ${checkoutPath}`);
	return res.stdout;
}

/**
 * Normalize an origin URL to `git@github.com:owner/repo.git` so the devbox can
 * clone over SSH using the Mac's forwarded ssh-agent (no token on the box).
 */
export function toSshOrigin(url: string): string {
	const https = url.match(/^https?:\/\/github\.com\/(.+?)(?:\.git)?\/?$/);
	if (https) return `git@github.com:${https[1]}.git`;
	return url;
}
