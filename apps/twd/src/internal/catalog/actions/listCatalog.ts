import { relative } from "node:path";
import { createTestFileResolver } from "@tw/testDiscovery/createTestFileResolver.ts";
import { readTestFileIndex } from "@tw/testDiscovery/readTestFileIndex.ts";
import type { Catalog } from "../../../api/contract.ts";
import { fileBaselines } from "../../../db/schema/results.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { getTestTreeAtSha } from "./getTestTreeAtSha.ts";
import { resolveBranchSha } from "./gitRemote.ts";

/**
 * Every group/suite with its files, plus every test file with its baseline p90,
 * as of `sha` (else the head of `branch`, else `dev`).
 */
export const listCatalog = async ({
	ctx,
	branch,
	sha,
}: {
	ctx: TwdContext;
	branch?: string;
	sha?: string;
}): Promise<Catalog> => {
	const { testsDir, groups } = await getTestTreeAtSha({
		ctx,
		sha: sha ?? (await resolveBranchSha({ branch: branch ?? "dev" })),
	});
	const { getAllGroups, getAllSuites } = groups;
	const toTestId = ({ absolutePath }: { absolutePath: string }) =>
		relative(testsDir, absolutePath);
	const resolver = await createTestFileResolver({ rootDir: testsDir });
	const { files: allFiles } = await readTestFileIndex({ rootDir: testsDir });

	const filesOf = (paths: string[]) =>
		new Set(
			paths.flatMap((path) =>
				resolver
					.resolvePath({ path })
					.map((absolutePath) => toTestId({ absolutePath })),
			),
		);
	const groupFiles = new Map(
		getAllGroups().map((group) => [group.name, filesOf(group.paths)]),
	);
	const suiteFiles = new Map(
		getAllSuites().map((suite) => [
			suite.name,
			new Set(
				suite.groups.flatMap((name) => [...(groupFiles.get(name) ?? [])]),
			),
		]),
	);

	const membership = new Map<string, string[]>();
	for (const [name, files] of [...groupFiles, ...suiteFiles]) {
		for (const file of files) {
			membership.set(file, [...(membership.get(file) ?? []), name]);
		}
	}

	const baselines = await ctx.db
		.select({ file: fileBaselines.file, p90Ms: fileBaselines.p90Ms })
		.from(fileBaselines);
	const p90ByFile = new Map(baselines.map((row) => [row.file, row.p90Ms]));

	return {
		groups: [
			...getAllGroups().map((group) => ({
				name: group.name,
				tier: group.tier,
				description: group.description,
				fileCount: groupFiles.get(group.name)?.size ?? 0,
			})),
			...getAllSuites().map((suite) => ({
				name: suite.name,
				tier: "suite" as const,
				description: suite.description,
				fileCount: suiteFiles.get(suite.name)?.size ?? 0,
			})),
		],
		files: allFiles
			.map((absolutePath) => toTestId({ absolutePath }))
			.sort()
			.map((path) => ({
				path,
				groups: membership.get(path) ?? [],
				baselineP90Ms: p90ByFile.get(path) ?? null,
			})),
	};
};
