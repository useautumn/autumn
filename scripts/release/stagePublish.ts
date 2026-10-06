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

// Stages listed and generator-owned changes; anything else makes the run stage nothing.
export const stagePublish = ({ root }: { root: string }) => {
	const patterns = loadGeneratedPaths({ root });
	const isGeneratorOwned = loadGeneratorOwnership({ root });
	const changed = changedPaths({ root });
	const unlisted = changed.filter(
		(path) => !isGeneratedPath({ patterns, path }) && !isGeneratorOwned(path),
	);
	if (unlisted.length > 0) return { staged: [], unlisted };
	if (changed.length > 0) git({ root, args: ["add", "-A", "--", ...changed] });
	return { staged: changed, unlisted };
};

// Usage: bun stagePublish.ts [repo root]
if (import.meta.main) {
	const root = process.argv[2] ?? join(import.meta.dir, "../..");
	const { staged, unlisted } = stagePublish({ root });
	for (const path of unlisted) {
		console.error(
			`::error file=${path}::Regeneration changed ${path}, which is neither in .github/generated-paths.txt nor owned by a generator. List it, or fix the generator.`,
		);
	}
	if (unlisted.length > 0) process.exit(1);
	console.log(`Staged ${staged.length} generated file(s).`);
}
