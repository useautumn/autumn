import { readFile } from "node:fs/promises";
import { resolveTestPaths } from "@tests/_groups/index.ts";
import { createTestFileResolver } from "@tw/testDiscovery/createTestFileResolver.ts";
import type { RunSelection } from "../../../db/schema/runs.ts";
import { TwdError } from "../../../http/apiError.ts";
import { TESTS_DIR, toTestId } from "../repoPaths.ts";

const CATALOG_HINT =
	"GET /catalog (or the list_catalog MCP tool) lists every group and file name.";

/**
 * Selection → sorted server/tests-relative files, using the same `_groups` + path
 * resolution as `bun tw`. No groups and no files means the `core` group.
 */
export const resolveTestSelection = async ({
	selection,
}: {
	selection: RunSelection;
}): Promise<string[]> => {
	const groups = selection.groups ?? [];
	const paths = selection.files ?? [];
	const resolver = await createTestFileResolver({ rootDir: TESTS_DIR });
	const files = new Set<string>();

	for (const group of groups.length === 0 && paths.length === 0
		? ["core"]
		: groups) {
		const groupPaths = resolveTestPaths({ name: group });
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
			next: `Use server/tests-relative paths or directory suffixes. ${CATALOG_HINT}`,
			details: { unmatched },
		});
	}

	// bun exits 1 when --test-name-pattern matches 0 tests, so keep only files whose
	// test/describe titles contain the (literal) grep.
	const grep = selection.grep;
	const titlePattern = grep
		? new RegExp(
				`\\b(?:test|it|describe)(?:\\.\\w+)*\\(\\s*[\`'"][^\\n]*${grep.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
			)
		: undefined;
	const selected = titlePattern
		? (
				await Promise.all(
					[...files].map(async (file) =>
						titlePattern.test(await readFile(file, "utf8")) ? file : undefined,
					),
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
	return selected.map((absolutePath) => toTestId({ absolutePath })).sort();
};
