import { TwdError } from "../../../http/apiError.ts";
import { REPO_ROOT } from "../repoPaths.ts";

/** Runs git in `cwd` (default: twd's checkout); TwdError `git_remote_unreachable` on failure. */
export const runGit = async ({
	args,
	cwd = REPO_ROOT,
}: {
	args: string[];
	cwd?: string;
}) => {
	const proc = Bun.spawn(["git", ...args], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (exitCode !== 0) {
		throw new TwdError({
			status: 502,
			code: "git_remote_unreachable",
			message: `git ${args[0]} failed: ${stderr.trim().slice(0, 300)}`,
			next: "Retry in a minute; GitHub may be briefly unavailable.",
			escalate:
				"twd cannot reach the GitHub remote — ask a twd admin to check git access on the daemon.",
		});
	}
	return stdout;
};

/** https GitHub URL of the repo under test (`TW_GIT_URL` overrides origin). */
export const getRepoUrl = async () => {
	const raw =
		process.env.TW_GIT_URL ||
		(await runGit({ args: ["config", "--get", "remote.origin.url"] })).trim();
	const https = raw.startsWith("git@github.com:")
		? `https://github.com/${raw.slice("git@github.com:".length)}`
		: raw;
	return https.replace(/\.git$/, "");
};

/** `owner/repo` for the GitHub API. */
export const getRepoSlug = async () =>
	(await getRepoUrl()).replace(/^https:\/\/(.*@)?github\.com\//, "");

/** branch → head sha for every branch on the remote (one ls-remote round trip). */
export const listRemoteHeads = async (): Promise<Map<string, string>> => {
	const output = await runGit({
		args: ["ls-remote", "--heads", await getRepoUrl()],
	});
	const heads = new Map<string, string>();
	for (const line of output.split("\n")) {
		const [sha, ref] = line.split("\t");
		if (sha && ref?.startsWith("refs/heads/")) {
			heads.set(ref.slice("refs/heads/".length), sha);
		}
	}
	return heads;
};

/** Head sha of a pushed branch; TwdError `branch_not_pushed` otherwise. */
export const resolveBranchSha = async ({ branch }: { branch: string }) => {
	const output = await runGit({
		args: ["ls-remote", "--heads", await getRepoUrl(), `refs/heads/${branch}`],
	});
	const sha = output.split("\t")[0]?.trim();
	if (!sha || !/^[0-9a-f]{40}$/.test(sha)) {
		throw new TwdError({
			status: 404,
			code: "branch_not_pushed",
			message: `Branch "${branch}" does not exist on the GitHub remote.`,
			next: `push the branch (git push -u origin ${branch}), then retry.`,
			escalate: "The branch must be pushed by whoever owns it.",
		});
	}
	return sha;
};
