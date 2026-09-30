import { existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const WORKSPACE_MANIFEST = /^(?:(?:apps|packages)\/)?[^/]+\/package\.json$/;

const listed: string[] = (await Bun.file(join(root, "package.json")).json())
	.workspaces.packages;
const tracked = (await Bun.$`git ls-files -- '*package.json'`.cwd(root).text())
	.split("\n")
	.filter((path) => WORKSPACE_MANIFEST.test(path))
	.map((path) => path.replace(/\/package\.json$/, ""));

const errors = [
	...listed
		.filter((dir) => /[*?[{]/.test(dir))
		.map((dir) => `"${dir}" is a glob; list each workspace explicitly.`),
	...listed
		.filter((dir) => !existsSync(join(root, dir, "package.json")))
		.map((dir) => `"${dir}" is in workspaces but has no package.json.`),
	...tracked
		.filter((dir) => !listed.includes(dir))
		.map((dir) => `"${dir}" has a package.json but is not in workspaces.`),
];

if (errors.length > 0) {
	for (const error of errors) console.error(`::error::${error}`);
	console.error(
		"Every top-level, apps/*, and packages/* folder with a package.json must be listed in the root package.json workspaces.",
	);
	process.exit(1);
}

console.log(`${listed.length} workspaces match their package.json folders.`);
