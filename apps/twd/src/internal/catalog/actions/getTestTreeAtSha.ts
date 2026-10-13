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
import { join, resolve } from "node:path";
import { TwdError } from "../../../http/apiError.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import {
	fetchShaIntoMirror,
	getCacheDir,
	withMirror,
} from "../mirror/gitMirror.ts";
import type { TestGroupsModule, TestTree } from "../types/testTree.ts";
import { runGit } from "./gitRemote.ts";

const GROUPS_DUMP_ENTRY = resolve(
	import.meta.dir,
	"../groupsProcess/dumpTestGroups.ts",
);
const GROUPS_DUMP_TIMEOUT_MS = 30_000;

type GroupsDump = {
	unsupported?: true;
	groups: ReturnType<TestGroupsModule["getAllGroups"]>;
	suites: ReturnType<TestGroupsModule["getAllSuites"]>;
	resolved: Record<string, string[] | null>;
};

/** A pushed commit's `_groups` is untrusted code: evaluate it in a child with no env (no DB, Stripe, GitHub or encryption secrets). */
const loadGroupsIsolated = async ({
	testsDir,
}: {
	testsDir: string;
}): Promise<TestGroupsModule | null> => {
	const child = Bun.spawn(["bun", GROUPS_DUMP_ENTRY, testsDir], {
		cwd: testsDir,
		env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
		stdout: "pipe",
		stderr: "pipe",
		timeout: GROUPS_DUMP_TIMEOUT_MS,
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	if (exitCode !== 0)
		throw new TwdError({
			status: 422,
			code: "test_groups_failed",
			message: `Loading server/tests/_groups failed: ${stderr.trim().slice(-500) || `exit ${exitCode}`}`,
			next: "Fix server/tests/_groups on the branch, push, and retry.",
		});
	const dump = JSON.parse(stdout) as GroupsDump;
	if (dump.unsupported) return null;
	return {
		getAllGroups: () => dump.groups,
		getAllSuites: () => dump.suites,
		resolveTestPaths: ({ name }: { name: string }) =>
			dump.resolved[name] ?? undefined,
	} as TestGroupsModule;
};

const TREE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const trees = new Map<string, Promise<TestTree>>();
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
			await fetchShaIntoMirror({ mirrorDir, sha });
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
	const groups = await loadGroupsIsolated({ testsDir });
	if (!groups) {
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
		groups,
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
