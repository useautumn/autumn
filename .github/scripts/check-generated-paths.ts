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

export const listPullRequestFiles = async ({
	ctx,
	repository,
	number,
	token,
}: {
	ctx: { fetch: (url: string, init?: RequestInit) => Promise<Response> };
	repository: string;
	number: number;
	token: string;
}) => {
	const files: string[] = [];
	for (let page = 1; ; page++) {
		const response = await ctx.fetch(
			`https://api.github.com/repos/${repository}/pulls/${number}/files?per_page=100&page=${page}`,
			{ headers: { authorization: `Bearer ${token}` } },
		);
		if (!response.ok) {
			throw new Error(`Listing PR files failed: HTTP ${response.status}`);
		}
		const batch: { filename: string; previous_filename?: string }[] =
			await response.json();
		for (const file of batch) {
			files.push(file.filename);
			if (file.previous_filename) files.push(file.previous_filename);
		}
		if (batch.length < 100) return files;
	}
};

if (import.meta.main) {
	const { GITHUB_REPOSITORY, PR_NUMBER, GH_TOKEN } = process.env;
	if (!GITHUB_REPOSITORY || !PR_NUMBER || !GH_TOKEN) {
		throw new Error("Missing GITHUB_REPOSITORY, PR_NUMBER or GH_TOKEN");
	}
	const root = join(import.meta.dir, "../..");
	const edits = findGeneratedEdits({
		list: await Bun.file(join(root, GENERATED_PATHS_FILE)).text(),
		files: await listPullRequestFiles({
			ctx: { fetch },
			repository: GITHUB_REPOSITORY,
			number: Number(PR_NUMBER),
			token: GH_TOKEN,
		}),
	});
	for (const path of edits) {
		console.error(
			`::error file=${path}::${path} is generated on main by the Publish workflow. Revert it; edit the source and let the release regenerate it.`,
		);
	}
	if (edits.length > 0) process.exit(1);
	console.log("No generated paths edited.");
}
