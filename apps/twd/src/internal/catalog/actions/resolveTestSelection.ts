import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { createTestFileResolver } from "@tw/testDiscovery/createTestFileResolver.ts";
import type { RunSelection } from "../../../db/schema/runs.ts";
import { TwdError } from "../../../http/apiError.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { isArchivedTestId } from "../repoPaths.ts";
import { getTestTreeAtSha } from "./getTestTreeAtSha.ts";

const CATALOG_HINT =
	"GET /catalog (or the list_catalog MCP tool) lists every group and file name.";

/**
 * Selection → sorted server/tests-relative files at `sha`, using that commit's
 * `_groups` + `bun tw` path resolution. A grep-only selection searches `core`.
 */
export const resolveTestSelection = async ({
	ctx,
	sha,
	selection,
}: {
	ctx: TwdContext;
	sha: string;
	selection: RunSelection;
}): Promise<string[]> => {
	const groups = selection.groups ?? [];
	const paths = selection.files ?? [];
	if (groups.length === 0 && paths.length === 0 && !selection.grep) {
		throw new TwdError({
			status: 400,
			code: "empty_selection",
			message: "Select at least one group, file, or grep pattern.",
			next: CATALOG_HINT,
		});
	}
	const { testsDir, groups: testGroups } = await getTestTreeAtSha({ ctx, sha });
	const allFiles = await createTestFileResolver({ rootDir: testsDir });
	const resolver = {
		resolvePath: ({ path }: { path: string }) =>
			allFiles
				.resolvePath({ path })
				.filter(
					(file) => !isArchivedTestId({ testId: relative(testsDir, file) }),
				),
	};
	const files = new Set<string>();

	for (const group of groups.length === 0 && paths.length === 0
		? ["core"]
		: groups) {
		const groupPaths = testGroups.resolveTestPaths({ name: group });
		if (!groupPaths) {
			throw new TwdError({
				status: 400,
				code: "unknown_group",
				message: `"${group}" is not a test group or suite.`,
				next: CATALOG_HINT,
				details: { group },
			});
		}
		for (const path of groupPaths) {
			for (const file of resolver.resolvePath({ path })) files.add(file);
		}
	}

	const unmatched: string[] = [];
	for (const path of paths) {
		const resolved = resolver.resolvePath({
			path: path.replace(/^server\/tests\//, ""),
		});
		if (resolved.length === 0) unmatched.push(path);
		for (const file of resolved) files.add(file);
	}
	if (unmatched.length > 0) {
		throw new TwdError({
			status: 400,
			code: "no_files_matched",
			message: `No test files matched: ${unmatched.join(", ")}`,
			next: `Use server/tests-relative paths or directory suffixes; archives/ is never runnable. ${CATALOG_HINT}`,
			details: { unmatched },
		});
	}

	// bun exits 1 when --test-name-pattern matches 0 tests, so drop files that can't match.
	// Runtime names join describe + test titles, so every grep word must appear in some title.
	const grep = selection.grep;
	const grepWords = grep?.toLowerCase().split(/\s+/).filter(Boolean) ?? [];
	const titlesOf = (source: string) =>
		[...source.matchAll(/\b(?:test|it|describe)(?:\.\w+)*\(\s*[`'"]([^\n]*)/g)]
			.map((m) => m[1] ?? "")
			.join("\n")
			.toLowerCase();
	const selected = grepWords.length
		? (
				await Promise.all(
					[...files].map(async (file) => {
						const titles = titlesOf(await readFile(file, "utf8"));
						return grepWords.every((word) => titles.includes(word))
							? file
							: undefined;
					}),
				)
			).filter((file): file is string => file !== undefined)
		: [...files];

	if (selected.length === 0) {
		throw new TwdError({
			status: 400,
			code: "no_files_matched",
			message: grep
				? `No selected test file contains "${grep}".`
				: "The selection resolved to zero test files.",
			next: `Widen the selection or fix the grep. ${CATALOG_HINT}`,
		});
	}
	return selected
		.map((absolutePath) => relative(testsDir, absolutePath))
		.sort();
};
