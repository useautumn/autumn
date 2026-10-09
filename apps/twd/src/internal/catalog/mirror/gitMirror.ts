import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { TwdError } from "../../../http/apiError.ts";
import { getRepoUrl, runGit } from "../actions/gitRemote.ts";

let mirrorQueue: Promise<unknown> = Promise.resolve();

export const getCacheDir = () =>
	process.env.TWD_CACHE_DIR || join(homedir(), ".cache", "twd");

/** Serialises git work on the shared bare mirror (fetches race on its shallow file). */
export const withMirror = <T>(work: (mirrorDir: string) => Promise<T>) => {
	const mirrorDir = join(getCacheDir(), "mirror.git");
	const next = mirrorQueue.then(async () => {
		if (!existsSync(join(mirrorDir, "HEAD"))) {
			await mkdir(mirrorDir, { recursive: true });
			await runGit({ args: ["init", "--bare", "--quiet"], cwd: mirrorDir });
		}
		return work(mirrorDir);
	});
	mirrorQueue = next.catch(() => undefined);
	return next;
};

const hasCommit = ({ mirrorDir, sha }: { mirrorDir: string; sha: string }) =>
	Bun.spawnSync(["git", "cat-file", "-e", `${sha}^{commit}`], {
		cwd: mirrorDir,
		stdout: "ignore",
		stderr: "ignore",
	}).exitCode === 0;

/** Call inside withMirror. TwdError `sha_not_found` when the commit was never pushed. */
export const fetchShaIntoMirror = async ({
	mirrorDir,
	sha,
}: {
	mirrorDir: string;
	sha: string;
}) => {
	if (hasCommit({ mirrorDir, sha })) return;
	// The ref keeps the commit as a negotiation base so later fetches are incremental.
	await runGit({
		args: [
			"fetch",
			"--quiet",
			"--depth=1",
			"--no-tags",
			await getRepoUrl(),
			`${sha}:refs/twd/${sha}`,
		],
		cwd: mirrorDir,
	}).catch((error: unknown) => {
		if (
			!/not our ref|couldn't find remote ref|unadvertised/i.test(
				String(error instanceof Error ? error.message : error),
			)
		)
			throw error;
		throw new TwdError({
			status: 404,
			code: "sha_not_found",
			message: `Commit ${sha} is not on the GitHub remote.`,
			next: "Push the commit (or pass a branch instead of a sha), then retry.",
			escalate: "The commit must be pushed by whoever owns it.",
		});
	});
};
