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

const splitChanges = ({ root }: { root: string }) => {
	const patterns = loadGeneratedPaths({ root });
	const isGeneratorOwned = loadGeneratorOwnership({ root });
	const isKnown = (path: string) =>
		isGeneratedPath({ patterns, path }) || isGeneratorOwned(path);
	const changed = changedPaths({ root });
	return {
		known: changed.filter(isKnown),
		unknown: changed.filter((path) => !isKnown(path)),
	};
};

// Run before planning: an unknown change must neither bump a package nor reach npm or main.
export const discardUnknownChanges = ({ root }: { root: string }) => {
	const { unknown } = splitChanges({ root });
	if (unknown.length === 0) return unknown;
	const tracked = git({ root, args: ["ls-files", "-z", "--", ...unknown] })
		.split("\0")
		.filter(Boolean);
	if (tracked.length > 0) git({ root, args: ["checkout", "--", ...tracked] });
	git({ root, args: ["clean", "-fq", "--", ...unknown] });
	return unknown;
};

// Stages listed and generator-owned changes; unknown ones stay unstaged so they never reach main or npm.
export const stagePublish = ({ root }: { root: string }) => {
	const { known, unknown } = splitChanges({ root });
	if (known.length > 0) git({ root, args: ["add", "-A", "--", ...known] });
	return { staged: known, unlisted: unknown };
};

const warnUnknown = ({ paths }: { paths: string[] }) => {
	for (const path of paths) {
		console.error(
			`::warning file=${path}::Regeneration changed ${path}, which is neither in .github/generated-paths.txt nor owned by a generator, so it was left out of the release. List it, or fix the generator.`,
		);
	}
	if (process.env.GITHUB_OUTPUT) {
		appendFileSync(
			process.env.GITHUB_OUTPUT,
			`unknown-files=${paths.join(",")}\n`,
		);
	}
};

// Usage: bun stagePublish.ts [--discard-unknown] [repo root]. Unknown files are a warning: the release still ships.
if (import.meta.main) {
	const args = process.argv.slice(2);
	const discard = args.includes("--discard-unknown");
	const root =
		args.find((arg) => arg !== "--discard-unknown") ??
		join(import.meta.dir, "../..");
	if (discard) {
		const unknown = discardUnknownChanges({ root });
		warnUnknown({ paths: unknown });
		console.log(`Discarded ${unknown.length} unknown regenerated file(s).`);
	} else {
		const { staged, unlisted } = stagePublish({ root });
		warnUnknown({ paths: unlisted });
		console.log(
			`Staged ${staged.length} generated file(s); left ${unlisted.length} unknown file(s) out.`,
		);
	}
}
