import { existsSync } from "node:fs";
import {
	mkdir,
	mkdtemp,
	readdir,
	rename,
	rm,
	stat,
	utimes,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { TwdError } from "../../../http/apiError.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import type { TestGroupsModule, TestTree } from "../types/testTree.ts";
import { getRepoUrl, runGit } from "./gitRemote.ts";

const TREE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const trees = new Map<string, Promise<TestTree>>();
let mirrorQueue: Promise<unknown> = Promise.resolve();

const getCacheDir = () =>
	process.env.TWD_CACHE_DIR || join(homedir(), ".cache", "twd");

/** Serialises git work on the shared bare mirror (fetches race on its shallow file). */
const withMirror = <T>(work: (mirrorDir: string) => Promise<T>) => {
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

/** Fetch `sha` into the mirror and extract its server/tests into `targetDir`. */
const extractTree = async ({
	sha,
	targetDir,
}: {
	sha: string;
	targetDir: string;
}) => {
	const tmpDir = await mkdtemp(`${targetDir}.tmp-`);
	try {
		await withMirror(async (mirrorDir) => {
			if (!hasCommit({ mirrorDir, sha })) {
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
			}
			await runGit({
				args: [
					"archive",
					"--format=tar",
					`--output=${tmpDir}/tree.tar`,
					sha,
					"server/tests",
				],
				cwd: mirrorDir,
			});
		});
		await Bun.$`tar -xf ${tmpDir}/tree.tar -C ${tmpDir}`.quiet();
		await rm(join(tmpDir, "tree.tar"));
		await rename(tmpDir, targetDir).catch((error: NodeJS.ErrnoException) => {
			if (error.code !== "ENOTEMPTY" && error.code !== "EEXIST") throw error;
		});
	} finally {
		await rm(tmpDir, { recursive: true, force: true });
	}
};

/** Drops trees (and their mirror refs) unused for 7 days; stale temp dirs go too. */
const evictStaleTrees = async ({ treesDir }: { treesDir: string }) => {
	const cutoff = Date.now() - TREE_TTL_MS;
	for (const name of await readdir(treesDir)) {
		const path = join(treesDir, name);
		const mtimeMs = await stat(path).then(
			(s) => s.mtimeMs,
			() => Date.now(),
		);
		if (mtimeMs >= cutoff) continue;
		trees.delete(name);
		await rm(path, { recursive: true, force: true });
		if (/^[0-9a-f]{40}$/.test(name)) {
			await withMirror((mirrorDir) =>
				runGit({
					args: ["update-ref", "-d", `refs/twd/${name}`],
					cwd: mirrorDir,
				}),
			).catch(() => undefined);
		}
	}
};

const loadTree = async ({
	ctx,
	sha,
}: {
	ctx: TwdContext;
	sha: string;
}): Promise<TestTree> => {
	const treesDir = join(getCacheDir(), "trees");
	const treeDir = join(treesDir, sha);
	await mkdir(treesDir, { recursive: true });
	if (!existsSync(treeDir)) {
		const startedAt = Date.now();
		await extractTree({ sha, targetDir: treeDir });
		ctx.logger.info("extracted server/tests", {
			sha,
			ms: Date.now() - startedAt,
		});
		evictStaleTrees({ treesDir }).catch((error: unknown) =>
			ctx.logger.warn("evicting stale test trees failed", {
				error: String(error),
			}),
		);
	}

	const testsDir = join(treeDir, "server", "tests");
	const groups: Partial<TestGroupsModule> = await import(
		join(testsDir, "_groups", "index.ts")
	);
	const { getAllGroups, getAllSuites, resolveTestPaths } = groups;
	if (!getAllGroups || !getAllSuites || !resolveTestPaths) {
		throw new TwdError({
			status: 422,
			code: "unsupported_test_groups",
			message: `server/tests/_groups at ${sha.slice(0, 12)} does not export getAllGroups/getAllSuites/resolveTestPaths.`,
			next: "Rebase the branch onto a recent dev, push, and retry.",
		});
	}
	return {
		sha,
		testsDir,
		groups: { getAllGroups, getAllSuites, resolveTestPaths },
	};
};

/** server/tests as of `sha`, extracted once per sha into `<TWD_CACHE_DIR>/trees/<sha>`. */
export const getTestTreeAtSha = async ({
	ctx,
	sha,
}: {
	ctx: TwdContext;
	sha: string;
}): Promise<TestTree> => {
	if (!/^[0-9a-f]{40}$/.test(sha)) {
		throw new TwdError({
			status: 400,
			code: "invalid_sha",
			message: `"${sha}" is not a full 40-char commit sha.`,
			next: "Pass the full sha, or a branch name instead.",
		});
	}
	let tree = trees.get(sha);
	if (!tree) {
		tree = loadTree({ ctx, sha });
		trees.set(sha, tree);
		tree.catch(() => trees.delete(sha));
	}
	const resolved = await tree;
	const now = new Date();
	await utimes(join(getCacheDir(), "trees", sha), now, now).catch(
		() => undefined,
	);
	return resolved;
};
