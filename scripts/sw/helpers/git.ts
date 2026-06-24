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

/**
 * Push the worktree's current HEAD straight to the devbox's clone as `branch` —
 * NEVER to origin. Works from a detached worktree (source is HEAD), and the box
 * already has the base history, so only the delta transfers.
 */
export function pushBranchToBox({
	checkout,
	sshDest,
	remotePath,
	branch,
}: {
	checkout: string;
	sshDest: string;
	remotePath: string;
	branch: string;
}): void {
	const res = sh(
		"git",
		[
			"-C",
			checkout,
			"push",
			"--force",
			`${sshDest}:${remotePath}`,
			`HEAD:refs/heads/${branch}`,
		],
		{
			env: {
				...(process.env as Record<string, string>),
				GIT_SSH_COMMAND: "ssh -o StrictHostKeyChecking=accept-new",
			},
		},
	);
	if (res.code !== 0) {
		fatal(`pushing ${branch} to the box failed: ${res.stderr || res.stdout}`);
	}
}

export function originUrl(checkoutPath: string): string {
	const res = sh("git", ["remote", "get-url", "origin"], { cwd: checkoutPath });
	if (res.code !== 0) fatal(`no origin remote at ${checkoutPath}`);
	return res.stdout;
}

/**
 * Normalize an origin URL to `https://github.com/owner/repo` so the devbox clones
 * via its exe.dev GitHub integration (which rewrites that prefix to the int host).
 */
export function toHttpsOrigin(url: string): string {
	const ssh = url.match(/^git@github\.com:(.+?)(?:\.git)?\/?$/);
	if (ssh) return `https://github.com/${ssh[1]}`;
	const https = url.match(/^https?:\/\/github\.com\/(.+?)(?:\.git)?\/?$/);
	if (https) return `https://github.com/${https[1]}`;
	return url;
}
