import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { resolveNpmVersion } from "./resolveNpmVersion";

export type PublishedPackage = {
	name: string;
	dir: string;
	tagPrefix: string;
	sourcePaths: string[];
};

export const PUBLISHED_PACKAGES: PublishedPackage[] = [
	{
		name: "autumn-js",
		dir: "packages/autumn-js",
		tagPrefix: "autumn-js",
		sourcePaths: [
			"packages/autumn-js",
			"packages/openapi",
			"packages/sdk",
			"shared",
		],
	},
	{
		name: "atmn",
		dir: "packages/atmn",
		tagPrefix: "atmn",
		sourcePaths: [
			"packages/atmn",
			"packages/atmn-generator",
			"packages/agent-docs",
			"packages/openapi",
			"shared",
			"apps/docs/mintlify",
		],
	},
	{
		name: "@useautumn/gateway",
		dir: "packages/gateway",
		tagPrefix: "gateway",
		sourcePaths: ["packages/gateway"],
	},
];

const git = ({ root, args }: { root: string; args: string[] }) => {
	const result = Bun.spawnSync(["git", ...args], { cwd: root });
	if (result.exitCode > 1) throw new Error(result.stderr.toString());
	return { exitCode: result.exitCode, stdout: result.stdout.toString().trim() };
};

const latestTag = ({ root, tagPrefix }: { root: string; tagPrefix: string }) =>
	git({ root, args: ["tag", "--list", `${tagPrefix}-v*`] })
		.stdout.split("\n")
		.filter((tag) => /^\d+\.\d+\.\d+$/.test(tag.slice(tagPrefix.length + 2)))
		.sort((a, b) =>
			Bun.semver.order(
				a.slice(tagPrefix.length + 2),
				b.slice(tagPrefix.length + 2),
			),
		)
		.at(-1);

// Compares the last published tag with the working tree, so freshly regenerated output counts.
const sourceChangedSinceTag = ({
	root,
	pkg,
}: {
	root: string;
	pkg: PublishedPackage;
}) => {
	const tag = latestTag({ root, tagPrefix: pkg.tagPrefix });
	if (!tag) return true;
	const diff = git({
		root,
		args: ["diff", "--quiet", tag, "--", ...pkg.sourcePaths],
	});
	const untracked = git({
		root,
		args: [
			"ls-files",
			"--others",
			"--exclude-standard",
			"--",
			...pkg.sourcePaths,
		],
	});
	return diff.exitCode === 1 || untracked.stdout !== "";
};

const writeManifestVersion = async ({
	path,
	from,
	to,
}: {
	path: string;
	from: string;
	to: string;
}) => {
	if (from === to) return;
	const text = await Bun.file(path).text();
	await Bun.write(
		path,
		text.replace(`"version": "${from}"`, `"version": "${to}"`),
	);
};

export const planPublish = async ({
	ctx,
	root,
	packages = PUBLISHED_PACKAGES,
	commitSha,
	force,
	dryRun,
}: {
	ctx: { fetch: (url: string, options: RequestInit) => Promise<Response> };
	root: string;
	packages?: PublishedPackage[];
	commitSha: string;
	force: string[];
	dryRun: boolean;
}) => {
	const unknown = force.filter(
		(name) => !packages.some((pkg) => pkg.name === name),
	);
	if (unknown.length > 0) {
		throw new Error(`Unknown packages to force: ${unknown.join(", ")}`);
	}

	const planned: {
		name: string;
		dir: string;
		tagPrefix: string;
		version: string;
	}[] = [];
	for (const pkg of packages) {
		if (!force.includes(pkg.name) && !sourceChangedSinceTag({ root, pkg })) {
			continue;
		}
		const manifestPath = join(root, pkg.dir, "package.json");
		const manifest = await Bun.file(manifestPath).json();
		const { version } = await resolveNpmVersion({
			ctx,
			packageName: pkg.name,
			minimumVersion: manifest.version,
			commitSha,
			dryRun,
		});
		await writeManifestVersion({
			path: manifestPath,
			from: manifest.version,
			to: version,
		});
		planned.push({
			name: pkg.name,
			dir: pkg.dir,
			tagPrefix: pkg.tagPrefix,
			version,
		});
	}
	return planned;
};

if (import.meta.main) {
	const {
		SOURCE_SHA,
		GITHUB_OUTPUT,
		FORCE_PACKAGES = "",
		DRY_RUN,
	} = process.env;
	if (!SOURCE_SHA || !GITHUB_OUTPUT)
		throw new Error("Missing release environment");
	const planned = await planPublish({
		ctx: { fetch },
		root: join(import.meta.dir, "../.."),
		commitSha: SOURCE_SHA,
		force: FORCE_PACKAGES.split(",")
			.map((name) => name.trim())
			.filter(Boolean),
		dryRun: DRY_RUN === "true",
	});
	appendFileSync(GITHUB_OUTPUT, `packages=${JSON.stringify(planned)}\n`);
	console.log(
		planned.length === 0
			? "No package source changed; nothing to publish."
			: planned.map((pkg) => `${pkg.name}@${pkg.version}`).join("\n"),
	);
}
