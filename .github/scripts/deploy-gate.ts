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

const root = join(import.meta.dir, "../..");
const baseSha = process.env.BASE_SHA ?? "";

type AffectedPackage = { path: string; reason: { __typename: string } };

const loadWorkspaceDirs = async (): Promise<string[]> =>
	(await Bun.file(join(root, "package.json")).json()).workspaces.packages;

/** Image apps plus workspaces their tsconfig `paths` alias, which Bun runs from source. */
const loadImageWorkspaceDirs = async ({
	workspaceDirs,
}: {
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

const loadAffectedWorkspaceDirs = async (): Promise<string[]> => {
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

const decide = async (): Promise<{ deploy: boolean; reason: string }> => {
	if (!baseSha) return { deploy: true, reason: "no previous successful build" };

	const baseExists = await Bun.$`git cat-file -e ${baseSha}^{commit}`
		.cwd(root)
		.nothrow()
		.quiet();
	if (baseExists.exitCode !== 0) {
		return { deploy: true, reason: `base ${baseSha} is not in history` };
	}

	const workspaceDirs = await loadWorkspaceDirs();
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

	const imageDirs = await loadImageWorkspaceDirs({ workspaceDirs });
	const affected = await loadAffectedWorkspaceDirs();
	const affectedImageDirs = affected.filter((dir) => imageDirs.has(dir));
	if (affectedImageDirs.length > 0) {
		return { deploy: true, reason: `affects ${affectedImageDirs.join(", ")}` };
	}

	return {
		deploy: false,
		reason: `no image changes (affected: ${affected.join(", ") || "none"})`,
	};
};

const { deploy, reason } = await decide();
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
