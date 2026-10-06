import { join } from "node:path";
import {
	GENERATED_PATHS_FILE,
	isGeneratedPath,
	parseGeneratedPaths,
} from "../../scripts/release/generatedPaths";

export const findGeneratedEdits = ({
	list,
	files,
}: {
	list: string;
	files: string[];
}) => {
	const patterns = parseGeneratedPaths({ text: list, scope: "pr-check" });
	return files
		.map((file) => file.trim())
		.filter((path) => path !== "" && isGeneratedPath({ patterns, path }));
};

// Reads the PR's changed paths (one per line) from stdin.
if (import.meta.main) {
	const root = join(import.meta.dir, "../..");
	const edits = findGeneratedEdits({
		list: await Bun.file(join(root, GENERATED_PATHS_FILE)).text(),
		files: (await Bun.stdin.text()).split("\n"),
	});
	for (const path of edits) {
		console.error(
			`::error file=${path}::${path} is generated on main by the Publish workflow. Revert it; edit the source and let the release regenerate it.`,
		);
	}
	if (edits.length > 0) process.exit(1);
	console.log("No generated paths edited.");
}
