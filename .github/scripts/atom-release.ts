import { appendFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { advanceBasePastPublishCommits, listCommitsAfter } from "./deploy-gate";

const PROJECTS = ["autumn", "autumn-staging"] as const;
type Project = (typeof PROJECTS)[number];

const ALIEN_API_URL = "https://api.alien.dev";
const ALIEN_WORKSPACE = "autumn";
const ALIEN_CLI_VERSION = "3.3.32";
const STACK_DIR = "packages/alien/stacks/byoc";
const ATOM_ENTRY = "apps/atom/src/main.ts";
const RELEASES_PAGE = 100;
const MAX_TITLE = 200;

const ROOT_INPUTS = [
	/^package\.json$/,
	/^bun\.lock$/,
	/^bunfig\.toml$/,
	/^patches\//,
];
const WORKSPACE_CONFIGS = ["package.json", "tsconfig.json", "bunfig.toml"];

type Release = {
	id: string;
	createdAt: string;
	currentChannels: string[];
	gitMetadata?: { commitSha?: string | null; dirty?: boolean | null } | null;
};

const alienGet = async <T>({
	apiKey,
	path,
	project,
	query = {},
}: {
	apiKey: string;
	path: string;
	project: Project;
	query?: Record<string, string>;
}): Promise<T> => {
	const params = new URLSearchParams({
		workspace: ALIEN_WORKSPACE,
		project,
		...query,
	});
	const response = await fetch(`${ALIEN_API_URL}${path}?${params}`, {
		headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
	});
	if (!response.ok)
		throw new Error(
			`Alien GET ${path}: ${response.status} ${await response.text()}`,
		);
	return (await response.json()) as T;
};

export const assertProject = ({
	project,
	answered,
	channels,
}: {
	project: Project;
	answered: { id: string; name: string };
	channels: { projectId: string }[];
}) => {
	if (answered.name !== project)
		throw new Error(`Alien answered for "${answered.name}", not "${project}"`);
	if (channels.some(({ projectId }) => projectId !== answered.id))
		throw new Error(`Alien listed channels outside ${project}`);
};

export const atomInputMatcher = ({
	bundledFiles,
	workspaceDirs,
}: {
	bundledFiles: string[];
	workspaceDirs: string[];
}) => {
	const files = new Set(
		bundledFiles.filter((file) => !file.includes("node_modules/")),
	);
	const workspaces = new Set(
		[...files].flatMap((file) =>
			workspaceDirs.filter((dir) => file.startsWith(`${dir}/`)),
		),
	);
	for (const dir of workspaces)
		for (const config of WORKSPACE_CONFIGS) files.add(join(dir, config));
	return (file: string) =>
		files.has(file) ||
		file.startsWith(`${STACK_DIR}/`) ||
		ROOT_INPUTS.some((pattern) => pattern.test(file));
};

const bundleAtom = async ({ root }: { root: string }) => {
	const result = await Bun.build({
		entrypoints: [join(root, ATOM_ENTRY)],
		target: "bun",
		metafile: true,
	});
	if (!result.success) throw new Error("Bundling the Atom failed");
	return Object.keys(result.metafile?.inputs ?? {}).map((file) =>
		file.startsWith(root) ? file.slice(root.length + 1) : file,
	);
};

/** Alien compiles the Atom with whatever `bun` is on PATH, and the binary carries that runtime: it must be the repo's. */
export const assertPinnedBun = ({
	packageManager,
	found,
}: {
	packageManager: string;
	found: string;
}) => {
	const pinned = packageManager.match(/^bun@(\d+\.\d+\.\d+)$/)?.[1];
	if (!pinned)
		throw new Error(
			`package.json packageManager "${packageManager}" pins no Bun version`,
		);
	if (found !== pinned)
		throw new Error(
			`Expected bun ${pinned} (package.json packageManager), found "${found}"`,
		);
};

export type Decision =
	| { release: true; reason: string }
	| { release: false; reason: string };

export const decideRelease = ({
	sha,
	releases,
	isReleasedAncestor,
	changedFilesSince,
	isAtomInput,
}: {
	sha: string;
	releases: Release[];
	isReleasedAncestor: (releasedSha: string) => boolean;
	changedFilesSince: (baseSha: string) => string[];
	isAtomInput: (file: string) => boolean;
}): Decision => {
	if (releases.some(({ gitMetadata }) => gitMetadata?.commitSha === sha))
		return {
			release: false,
			reason: `a release for ${sha.slice(0, 7)} already exists`,
		};
	const last = releases
		.filter(
			({ gitMetadata }) =>
				gitMetadata?.commitSha &&
				gitMetadata.dirty !== true &&
				isReleasedAncestor(gitMetadata.commitSha),
		)
		.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
	const baseSha = last?.gitMetadata?.commitSha;
	if (!baseSha)
		return { release: true, reason: "no earlier clean release on this branch" };
	const changed = changedFilesSince(baseSha).filter(isAtomInput);
	return changed.length > 0
		? {
				release: true,
				reason: `${changed.length} Atom input(s) changed since ${baseSha.slice(0, 7)}, e.g. ${changed[0]}`,
			}
		: {
				release: false,
				reason: `no Atom input changed since ${baseSha.slice(0, 7)}`,
			};
};

export const releaseTitle = ({
	pullRequest,
	subject,
}: {
	pullRequest: { number: number; title: string } | null;
	subject: string;
}) =>
	(pullRequest ? `#${pullRequest.number} ${pullRequest.title}` : subject).slice(
		0,
		MAX_TITLE,
	);

const git = async ({ root, args }: { root: string; args: string[] }) =>
	(await Bun.$`git ${args}`.cwd(root).quiet().text()).trim();

const findPullRequest = async ({ sha }: { sha: string }) => {
	const result = await Bun.$`gh api repos/useautumn/autumn/commits/${sha}/pulls`
		.nothrow()
		.quiet();
	if (result.exitCode !== 0) return null;
	const pulls = JSON.parse(result.stdout.toString()) as {
		number: number;
		title: string;
		merged_at: string | null;
	}[];
	return pulls.find(({ merged_at }) => merged_at) ?? pulls[0] ?? null;
};

const parseArgs = ({ argv }: { argv: string[] }) => {
	const project = argv
		.find((arg) => arg.startsWith("--project="))
		?.slice("--project=".length);
	if (!PROJECTS.includes(project as Project))
		throw new Error(`--project must be one of ${PROJECTS.join(", ")}`);
	return { project: project as Project, dryRun: argv.includes("--dry-run") };
};

const setOutput = ({ key, value }: { key: string; value: string }) => {
	if (process.env.GITHUB_OUTPUT)
		appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
};

async function main() {
	const { project, dryRun } = parseArgs({ argv: Bun.argv.slice(2) });
	const apiKey = process.env.ALIEN_API_KEY;
	if (!apiKey) throw new Error("ALIEN_API_KEY is not set");
	const root = await git({
		root: import.meta.dir,
		args: ["rev-parse", "--show-toplevel"],
	});
	const sha = await git({ root, args: ["rev-parse", "HEAD"] });

	const [answered, channels] = await Promise.all([
		alienGet<{ id: string; name: string }>({
			apiKey,
			project,
			path: `/v1/projects/${project}`,
		}),
		alienGet<{ items: { projectId: string }[] }>({
			apiKey,
			project,
			path: "/v1/release-channels",
		}),
	]);
	assertProject({ project, answered, channels: channels.items });

	const { items: releases } = await alienGet<{ items: Release[] }>({
		apiKey,
		project,
		path: "/v1/releases",
		query: { allChannels: "true", limit: String(RELEASES_PAGE) },
	});
	const workspaceDirs: string[] = (
		await Bun.file(join(root, "package.json")).json()
	).workspaces.packages;
	const isAtomInput = atomInputMatcher({
		bundledFiles: await bundleAtom({ root }),
		workspaceDirs,
	});
	const decision = decideRelease({
		sha,
		releases,
		isReleasedAncestor: (releasedSha) =>
			Bun.spawnSync(["git", "merge-base", "--is-ancestor", releasedSha, sha], {
				cwd: root,
			}).exitCode === 0,
		changedFilesSince: (baseSha) => {
			const base = advanceBasePastPublishCommits({
				commits: listCommitsAfter({ root, baseSha }),
				baseSha,
			});
			return Bun.spawnSync(["git", "diff", "--name-only", base, sha], {
				cwd: root,
			})
				.stdout.toString()
				.split("\n")
				.filter(Boolean);
		},
		isAtomInput,
	});
	console.log(
		`Decision: ${decision.release ? "release" : "skip"}; ${decision.reason}`,
	);
	setOutput({ key: "released", value: "false" });
	if (!decision.release) return;

	if ((await git({ root, args: ["status", "--porcelain"] })) !== "")
		throw new Error("The checkout is dirty; refusing to cut a release from it");
	const subject = await git({ root, args: ["log", "-1", "--format=%s", sha] });
	const title = releaseTitle({
		pullRequest: await findPullRequest({ sha }),
		subject,
	});
	const command = [
		"alien",
		"release",
		"--project",
		project,
		"--workspace",
		ALIEN_WORKSPACE,
		"--platforms",
		"aws",
		"--no-promote",
		"--title",
		title,
		"--json",
	];
	console.log(
		JSON.stringify(
			{ project, projectId: answered.id, sha, title, command },
			null,
			2,
		),
	);
	if (dryRun) {
		console.log("Dry run: nothing written to Alien.");
		return;
	}

	const version = (await Bun.$`alien --version`.quiet().text()).trim();
	if (version !== `alien ${ALIEN_CLI_VERSION}`)
		throw new Error(`Expected alien ${ALIEN_CLI_VERSION}, found "${version}"`);
	assertPinnedBun({
		packageManager: (await Bun.file(join(root, "package.json")).json())
			.packageManager,
		found: (
			await Bun.$`bun --version`.cwd(join(root, STACK_DIR)).quiet().text()
		).trim(),
	});
	// Alien's build cache is keyed by source, not by Bun: a binary cached under another Bun would ship as is.
	rmSync(join(root, STACK_DIR, ".alien", "build"), {
		recursive: true,
		force: true,
	});
	const cut = Bun.spawnSync(command, {
		cwd: join(root, STACK_DIR),
		stderr: "inherit",
	});
	if (cut.exitCode !== 0)
		throw new Error(`alien release exited ${cut.exitCode}`);
	const output = cut.stdout.toString();
	const { releaseId, channel } = JSON.parse(
		output.slice(output.indexOf("{")),
	) as { releaseId?: string; channel?: string | null };
	if (!releaseId)
		throw new Error(`alien release printed no release id: ${output}`);

	const created = await alienGet<Release>({
		apiKey,
		project,
		path: `/v1/releases/${releaseId}`,
	});
	if (channel || created.currentChannels.length > 0)
		throw new Error(
			`Release ${releaseId} is on ${created.currentChannels.join(", ")}; it must not be promoted`,
		);
	console.log(
		`Released ${releaseId} (${sha.slice(0, 7)}) to ${project}, not promoted.`,
	);
	setOutput({ key: "released", value: "true" });
	setOutput({ key: "release_id", value: releaseId });
}

if (import.meta.main) await main();
