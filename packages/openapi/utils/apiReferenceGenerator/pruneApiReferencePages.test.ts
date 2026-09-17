import { afterEach, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pruneApiReferencePages } from "./pruneApiReferencePages";

const directories: string[] = [];
afterEach(() => {
	for (const directory of directories.splice(0))
		rmSync(directory, { recursive: true, force: true });
});

test("prunes removed and renamed reference pages and navigation without touching sources", () => {
	const root = mkdtempSync(path.join(tmpdir(), "docs-pruning-"));
	directories.push(root);
	const docsDir = path.join(root, "mintlify");
	const files = [
		"mintlify/api-reference/core/removed.mdx",
		"mintlify/api-reference/core/oldName.mdx",
		"mintlify/api-reference/core/newName.mdx",
		"mintlify/api-reference/webhooks/removed.mdx",
		"mintlify/api-reference/platform.yaml",
		"mintlify/documentation/manual.mdx",
		"api-reference-generator/core/removed.mdx",
		"mintlify/api-reference/platform/overview.mdx",
		"mintlify/api-reference/platform/create-organization.mdx",
	];
	for (const file of files) {
		mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
		writeFileSync(path.join(root, file), "preserved content");
	}
	for (const file of files.slice(0, 2)) {
		writeFileSync(
			path.join(root, file),
			'import { DynamicParamField } from "/snippets/dynamic-param-field.jsx";',
		);
	}
	writeFileSync(
		path.join(root, files[3]),
		'---\nopenapi: "api/openapi.yml webhook removed.event"\n---',
	);
	writeFileSync(
		path.join(docsDir, "docs.json"),
		JSON.stringify({
			name: "Docs",
			navigation: {
				tabs: [
					{
						groups: [
							{
								pages: [
									"api-reference/core/removed",
									"api-reference/core/oldName",
									"api-reference/core/newName",
									{
										group: "Webhooks",
										pages: ["api-reference/webhooks/removed"],
									},
									"documentation/manual",
								],
							},
						],
					},
				],
			},
		}),
	);
	pruneApiReferencePages({
		docsDir,
		generatedPages: ["api-reference/core/newName"],
	});
	for (const file of files.slice(0, 2).concat(files[3]))
		expect(existsSync(path.join(root, file))).toBe(false);
	for (const file of [files[2], ...files.slice(4)])
		expect(readFileSync(path.join(root, file), "utf8")).toBe(
			"preserved content",
		);
	const config = JSON.parse(
		readFileSync(path.join(docsDir, "docs.json"), "utf8"),
	);
	expect(config.name).toBe("Docs");
	expect(config.navigation.tabs[0].groups[0].pages).toEqual([
		"api-reference/core/newName",
		{ group: "Webhooks", pages: [] },
		"documentation/manual",
	]);
	const before = readFileSync(path.join(docsDir, "docs.json"), "utf8");
	pruneApiReferencePages({
		docsDir,
		generatedPages: ["api-reference/core/newName"],
	});
	expect(readFileSync(path.join(docsDir, "docs.json"), "utf8")).toBe(before);
});
