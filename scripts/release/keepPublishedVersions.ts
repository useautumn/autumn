import { appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";

type PlannedPackage = {
	name: string;
	dir: string;
	tagPrefix: string;
	version: string;
};

const setWorkspaceLockVersion = ({
	lockText,
	dir,
	version,
}: {
	lockText: string;
	dir: string;
	version: string;
}) =>
	lockText.replace(
		new RegExp(
			`("${dir}": \\{\\n\\s*"name": "[^"]+",\\n\\s*"version": ")[^"]+(")`,
		),
		`$1${version}$2`,
	);

// Main must match npm: undo the version bump of every package whose publish failed.
export const keepPublishedVersions = async ({
	root,
	planned,
	published,
	previousVersions,
}: {
	root: string;
	planned: PlannedPackage[];
	published: string[];
	previousVersions: Record<string, string>;
}) => {
	const unpublished = planned.filter(
		(pkg) => !published.includes(pkg.tagPrefix),
	);
	const lockFile = Bun.file(join(root, "bun.lock"));
	let lockText = (await lockFile.exists()) ? await lockFile.text() : undefined;
	for (const pkg of unpublished) {
		const previous = previousVersions[pkg.dir];
		if (!previous) throw new Error(`No previous version for ${pkg.dir}`);
		const manifestFile = Bun.file(join(root, pkg.dir, "package.json"));
		await Bun.write(
			manifestFile,
			(await manifestFile.text()).replace(
				`"version": "${pkg.version}"`,
				`"version": "${previous}"`,
			),
		);
		if (lockText) {
			lockText = setWorkspaceLockVersion({
				lockText,
				dir: pkg.dir,
				version: previous,
			});
		}
	}
	if (lockText) await Bun.write(lockFile, lockText);
	return planned.filter((pkg) => published.includes(pkg.tagPrefix));
};

// Env: PACKAGES (planned JSON), PUBLISHED_DIR (holds one `published-<tagPrefix>` dir per success), SOURCE_SHA.
if (import.meta.main) {
	const { PACKAGES, PUBLISHED_DIR, SOURCE_SHA, GITHUB_OUTPUT } = process.env;
	if (!PACKAGES || !PUBLISHED_DIR || !SOURCE_SHA || !GITHUB_OUTPUT) {
		throw new Error(
			"Missing PACKAGES, PUBLISHED_DIR, SOURCE_SHA or GITHUB_OUTPUT",
		);
	}
	const root = process.cwd();
	const planned: PlannedPackage[] = JSON.parse(PACKAGES);
	const previousVersions = Object.fromEntries(
		planned.map((pkg) => {
			const show = Bun.spawnSync(
				["git", "show", `${SOURCE_SHA}:${pkg.dir}/package.json`],
				{
					cwd: root,
				},
			);
			return [pkg.dir, JSON.parse(show.stdout.toString()).version as string];
		}),
	);
	const published = planned
		.map((pkg) => pkg.tagPrefix)
		.filter((prefix) => existsSync(join(PUBLISHED_DIR, `published-${prefix}`)));
	const kept = await keepPublishedVersions({
		root,
		planned,
		published,
		previousVersions,
	});
	for (const pkg of planned.filter((pkg) => !kept.includes(pkg))) {
		console.log(
			`::warning::${pkg.name}@${pkg.version} did not publish; its version bump is not committed.`,
		);
	}
	appendFileSync(GITHUB_OUTPUT, `packages=${JSON.stringify(kept)}\n`);
}
