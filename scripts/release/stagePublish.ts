import { join } from "node:path";
import { isGeneratedPath, loadGeneratedPaths } from "./generatedPaths";

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

export const stagePublish = ({ root }: { root: string }) => {
	const patterns = loadGeneratedPaths({ root });
	const changed = changedPaths({ root });
	const staged = changed.filter((path) => isGeneratedPath({ patterns, path }));
	const unlisted = changed.filter((path) => !staged.includes(path));
	if (staged.length > 0) git({ root, args: ["add", "-A", "--", ...staged] });
	return { staged, unlisted };
};

if (import.meta.main) {
	const { staged, unlisted } = stagePublish({
		root: join(import.meta.dir, "../.."),
	});
	console.log(`Staged ${staged.length} generated file(s).`);
	for (const path of unlisted) {
		console.log(
			`::warning file=${path}::Regeneration changed ${path}, which is not in .github/generated-paths.txt, so it was not committed.`,
		);
	}
}
