import { appendFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const IMAGE_APPS = [
	"server",
	"apps/leaf",
	"apps/herald",
	"apps/balance-worker",
];
// Files outside any workspace that still change the image or its install.
const IMAGE_ROOT_FILES = [
	/^package\.json$/,
	/^bun\.lock$/,
	/^bunfig\.toml$/,
	/^patches\//,
	/^docker\//,
	/^\.dockerignore$/,
	/^scripts\/preload-env\.ts$/,
];
// Folders outside any workspace that never reach the running image.
const NON_RUNTIME_PATHS = [
	/^\.github\//,
	/^\.(agents|claude|codex|conductor|context|cursor|husky|opencode|plans|superset|vscode|zed)\//,
	/^plans\//,
	/^\.bun-version$/,
	/^ai$/,
	/^[^/]+\.md$/,
];

const PUBLISH_BOT_AUTHOR = "autumn-codegen[bot]";
const PUBLISH_SUBJECT = /^chore: publish generated files for \S+ \[skip ci\]$/;

type AffectedPackage = { path: string; reason: { __typename: string } };

export type BuildRun = {
	headSha: string;
	conclusion: string;
	event: string;
	headBranch: string;
	createdAt: string;
};

// The API's branch/event/status filters return stale runs, so filter and order client-side.
export const selectBaseSha = ({ runs }: { runs: BuildRun[] }) =>
	runs
		.filter(
			(run) =>
				run.headBranch === "main" &&
				run.event === "push" &&
				run.conclusion === "success",
		)
		.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0]
		?.headSha ?? "";

export type CommitSummary = { sha: string; author: string; subject: string };

// First-parent commits after `baseSha`, oldest first.
export const listCommitsAfter = ({
	root,
	baseSha,
}: {
	root: string;
	baseSha: string;
}): CommitSummary[] => {
	const log = Bun.spawnSync(
		[
			"git",
			"log",
			"--reverse",
			"--first-parent",
			"--ancestry-path",
			"--format=%H%x09%an%x09%s",
			`${baseSha}..HEAD`,
		],
		{ cwd: root },
	);
	if (log.exitCode !== 0) return [];
	return log.stdout
		.toString()
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const [sha = "", author = "", subject = ""] = line.split("\t");
			return { sha, author, subject };
		});
};

const isPublishCommit = ({ author, subject }: CommitSummary) =>
	author === PUBLISH_BOT_AUTHOR && PUBLISH_SUBJECT.test(subject);

// Publish-bot commits are [skip ci] and never build, so their files would land in the next merge's diff.
export const advanceBasePastPublishCommits = ({
	commits,
	baseSha,
}: {
	commits: CommitSummary[];
	baseSha: string;
}) => {
	let advanced = baseSha;
	for (const commit of commits) {
		if (!isPublishCommit(commit)) break;
		advanced = commit.sha;
	}
	return advanced;
};

const loadWorkspaceDirs = async ({
	root,
}: {
	root: string;
}): Promise<string[]> =>
	(await Bun.file(join(root, "package.json")).json()).workspaces.packages;

/** Image apps plus workspaces their tsconfig `paths` alias, which Bun runs from source. */
const loadImageWorkspaceDirs = async ({
	root,
	workspaceDirs,
}: {
	root: string;
	workspaceDirs: string[];
}): Promise<Set<string>> => {
	const imageDirs = new Set(IMAGE_APPS);
	for (const app of IMAGE_APPS) {
		const tsconfig = Bun.JSONC.parse(
			await Bun.file(join(root, app, "tsconfig.json")).text(),
		) as { compilerOptions?: { paths?: Record<string, string[]> } };
		for (const targets of Object.values(
			tsconfig.compilerOptions?.paths ?? {},
		)) {
			for (const target of targets) {
				const file = relative(root, resolve(root, app, target));
				const workspace = workspaceDirs.find(
					(dir) => file === dir || file.startsWith(`${dir}/`),
				);
				if (workspace) imageDirs.add(workspace);
			}
		}
	}
	return imageDirs;
};

const loadAffectedWorkspaceDirs = async ({
	root,
	baseSha,
}: {
	root: string;
	baseSha: string;
}): Promise<string[]> => {
	const query = `query { affectedPackages(base: "${baseSha}", head: "HEAD") { items { path reason { __typename } } } }`;
	const output =
		await Bun.$`${join(root, "node_modules/.bin/turbo")} query ${query}`
			.cwd(root)
			.env({ ...process.env, TURBO_TELEMETRY_DISABLED: "1" })
			.text();
	const items: AffectedPackage[] = JSON.parse(output.slice(output.indexOf("{")))
		.data.affectedPackages.items;
	// The root package.json only links the atmn CLI; it is not part of the image.
	return items
		.filter((item) => item.reason.__typename !== "RootInternalDepChanged")
		.map((item) => item.path)
		.filter((path) => path !== "");
};

export const decide = async ({
	root,
	baseSha: lastBuiltSha,
	listCommits = listCommitsAfter,
}: {
	root: string;
	baseSha: string;
	listCommits?: typeof listCommitsAfter;
}): Promise<{ deploy: boolean; reason: string }> => {
	if (!lastBuiltSha) {
		return { deploy: true, reason: "no previous successful build" };
	}

	const baseExists = await Bun.$`git cat-file -e ${lastBuiltSha}^{commit}`
		.cwd(root)
		.nothrow()
		.quiet();
	if (baseExists.exitCode !== 0) {
		return { deploy: true, reason: `base ${lastBuiltSha} is not in history` };
	}
	const baseSha = advanceBasePastPublishCommits({
		commits: listCommits({ root, baseSha: lastBuiltSha }),
		baseSha: lastBuiltSha,
	});

	const workspaceDirs = await loadWorkspaceDirs({ root });
	const changedFiles = (
		await Bun.$`git diff --name-only ${baseSha} HEAD`.cwd(root).text()
	)
		.split("\n")
		.filter(Boolean);
	const isInWorkspace = (file: string) =>
		workspaceDirs.some((dir) => file.startsWith(`${dir}/`));

	const imageRootFile = changedFiles.find(
		(file) =>
			IMAGE_ROOT_FILES.some((pattern) => pattern.test(file)) ||
			(!isInWorkspace(file) &&
				!NON_RUNTIME_PATHS.some((pattern) => pattern.test(file))),
	);
	if (imageRootFile) {
		return { deploy: true, reason: `${imageRootFile} changed` };
	}

	const imageDirs = await loadImageWorkspaceDirs({ root, workspaceDirs });
	const affected = await loadAffectedWorkspaceDirs({ root, baseSha });
	const affectedImageDirs = affected.filter((dir) => imageDirs.has(dir));
	if (affectedImageDirs.length > 0) {
		return { deploy: true, reason: `affects ${affectedImageDirs.join(", ")}` };
	}

	return {
		deploy: false,
		reason: `no image changes (affected: ${affected.join(", ") || "none"})`,
	};
};

if (import.meta.main) {
	const root = join(import.meta.dir, "../..");
	const baseSha = selectBaseSha({
		runs: JSON.parse(process.env.BUILD_RUNS ?? "[]"),
	});
	const { deploy, reason } = await decide({ root, baseSha });
	console.log(`deploy=${deploy}: ${reason}`);
	if (process.env.GITHUB_OUTPUT) {
		appendFileSync(process.env.GITHUB_OUTPUT, `deploy=${deploy}\n`);
	}
	if (process.env.GITHUB_STEP_SUMMARY) {
		appendFileSync(
			process.env.GITHUB_STEP_SUMMARY,
			`Production deploy: **${deploy ? "yes" : "skipped"}** (${reason}, base ${baseSha || "none"})\n`,
		);
	}
}
