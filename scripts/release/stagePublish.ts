import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { isGeneratedPath, loadGeneratedPaths } from "./generatedPaths";
import { loadGeneratorOwnership } from "./generatorOwnership";

const git = ({ root, args }: { root: string; args: string[] }) => {
	const result = Bun.spawnSync(["git", ...args], { cwd: root });
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	return result.stdout.toString();
};

const changedPaths = ({ root }: { root: string }) =>
	git({
		root,
		args: ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
	})
		.split("\0")
		.filter(Boolean)
		.map((entry) => entry.slice(3))
		.sort();

// Stages listed and generator-owned changes; unknown ones stay unstaged so they never reach main or npm.
export const stagePublish = ({ root }: { root: string }) => {
	const patterns = loadGeneratedPaths({ root });
	const isGeneratorOwned = loadGeneratorOwnership({ root });
	const changed = changedPaths({ root });
	const isKnown = (path: string) =>
		isGeneratedPath({ patterns, path }) || isGeneratorOwned(path);
	const staged = changed.filter(isKnown);
	const unlisted = changed.filter((path) => !isKnown(path));
	if (staged.length > 0) git({ root, args: ["add", "-A", "--", ...staged] });
	return { staged, unlisted };
};

// Usage: bun stagePublish.ts [repo root]. Unknown files are a warning: the release still ships.
if (import.meta.main) {
	const root = process.argv[2] ?? join(import.meta.dir, "../..");
	const { staged, unlisted } = stagePublish({ root });
	for (const path of unlisted) {
		console.error(
			`::warning file=${path}::Regeneration changed ${path}, which is neither in .github/generated-paths.txt nor owned by a generator, so it was left out of the release. List it, or fix the generator.`,
		);
	}
	if (process.env.GITHUB_OUTPUT) {
		appendFileSync(
			process.env.GITHUB_OUTPUT,
			`unknown-files=${unlisted.join(",")}\n`,
		);
	}
	console.log(
		`Staged ${staged.length} generated file(s); left ${unlisted.length} unknown file(s) out.`,
	);
}
