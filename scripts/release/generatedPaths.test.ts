import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
	isGeneratedPath,
	loadGeneratedPaths,
	parseGeneratedPaths,
} from "./generatedPaths";

const root = join(import.meta.dir, "../..");

const matches = ({ list, path }: { list: string; path: string }) =>
	isGeneratedPath({ patterns: parseGeneratedPaths({ text: list }), path });

describe("generated path globs", () => {
	test("* matches within one path segment", () => {
		expect(matches({ list: "docs/*.mdx", path: "docs/check.mdx" })).toBe(true);
		expect(matches({ list: "docs/*.mdx", path: "docs/core/check.mdx" })).toBe(
			false,
		);
		expect(matches({ list: "src/*/index.ts", path: "src/a/index.ts" })).toBe(
			true,
		);
	});

	test("** matches any depth, including none", () => {
		const list = "packages/**/generated.ts";
		expect(matches({ list, path: "packages/generated.ts" })).toBe(true);
		expect(matches({ list, path: "packages/a/b/c/generated.ts" })).toBe(true);
		expect(matches({ list, path: "other/a/generated.ts" })).toBe(false);
		expect(matches({ list: "sdk/**", path: "sdk/a/b.ts" })).toBe(true);
	});

	test("a trailing / covers the whole directory", () => {
		const list = "packages/sdk/src/models/";
		expect(matches({ list, path: "packages/sdk/src/models/a.ts" })).toBe(true);
		expect(matches({ list, path: "packages/sdk/src/models/x/y.ts" })).toBe(
			true,
		);
		expect(matches({ list, path: "packages/sdk/src/models.ts" })).toBe(false);
		expect(matches({ list, path: "packages/sdk/src/modelsx/a.ts" })).toBe(
			false,
		);
	});

	test("patterns are anchored at the repository root and match literally", () => {
		expect(matches({ list: "a/openapi.yml", path: "x/a/openapi.yml" })).toBe(
			false,
		);
		expect(matches({ list: "a/openapi.yml", path: "a/openapiXyml" })).toBe(
			false,
		);
	});

	test("patterns under # sync-only are listed but skipped by the PR check", () => {
		const text = "sdk/\n# sync-only\nbun.lock\npackages/*/package.json\n";
		expect(parseGeneratedPaths({ text })).toEqual([
			"sdk/",
			"bun.lock",
			"packages/*/package.json",
		]);
		expect(parseGeneratedPaths({ text, scope: "pr-check" })).toEqual(["sdk/"]);
		expect(parseGeneratedPaths({ text, scope: "sync-only" })).toEqual([
			"bun.lock",
			"packages/*/package.json",
		]);
	});

	test("comments and blank lines are ignored", () => {
		expect(
			parseGeneratedPaths({ text: "# comment\n\n  \nsdk/\n  # indented\n" }),
		).toEqual(["sdk/"]);
	});
});

describe(".github/generated-paths.txt", () => {
	const patterns = loadGeneratedPaths({ root });
	const generated = (path: string) => isGeneratedPath({ patterns, path });
	const gitFiles = (dir: string) =>
		Bun.spawnSync(["git", "ls-files", dir], { cwd: root })
			.stdout.toString()
			.trim()
			.split("\n")
			.filter(Boolean);

	test.each(["packages/sdk", "others/python-sdk"])(
		"covers every Speakeasy-owned file in %s and nothing hand-written",
		async (sdkDir) => {
			const lock = Bun.YAML.parse(
				await Bun.file(join(root, sdkDir, ".speakeasy/gen.lock")).text(),
			) as { trackedFiles: Record<string, unknown> };
			const owned = new Set(Object.keys(lock.trackedFiles));
			for (const file of gitFiles(sdkDir)) {
				const relative = file.slice(sdkDir.length + 1);
				if (owned.has(relative)) expect(file).toSatisfy(generated);
			}
			for (const handWritten of [
				"src/hooks/failOpenHook.ts",
				"src/hooks/registration.ts",
				"src/autumn_sdk/_hooks/fail_open_hook.py",
				"src/autumn_sdk/_hooks/registration.py",
				".speakeasy/gen.yaml",
				".speakeasy/workflow.yaml",
				"test/fail-open.test.ts",
				"tests/test_billing_custom_line_items.py",
				"examples/failOpen.example.ts",
			]) {
				expect(generated(`${sdkDir}/${handWritten}`)).toBe(false);
			}
		},
	);

	test("covers generated API reference pages but not hand-written ones", async () => {
		const generatedMarker =
			/import \{ DynamicParamField \} from "\/snippets\/dynamic-param-field\.jsx";|^openapi: ["']?api\/openapi\.yml webhook |coming soon\.<\/Note>/m;
		for (const file of gitFiles("apps/docs/mintlify/api-reference")) {
			if (!file.endsWith(".mdx")) continue;
			const content = await Bun.file(join(root, file)).text();
			expect({ file, generated: generated(file) }).toEqual({
				file,
				generated: generatedMarker.test(content),
			});
		}
	});

	test.each([
		"packages/openapi/openapi.yml",
		"packages/openapi/openapi-stripped.yml",
		"packages/openapi/openapi-internal.yml",
		"apps/docs/mintlify/api/openapi.yml",
		"packages/sdk/.speakeasy/code-samples.overlay.yaml",
		"others/python-sdk/.speakeasy/code-samples.overlay.yaml",
		"apps/docs/mintlify/snippets/svix-transforms/slack.mdx",
		"packages/autumn-js/src/generated/schemas.ts",
		"packages/atmn/src/generated/apiRoutes.ts",
		"packages/agent-docs/generated/mcp/catalog.md",
		"packages/agent-docs/src/generated/skills.generated.ts",
	])("covers generator output %s", (path) => {
		expect(generated(path)).toBe(true);
	});

	test.each([
		"packages/openapi/api.ts",
		"packages/autumn-js/src/index.ts",
		"packages/atmn/src/cli.ts",
		"shared/index.ts",
	])("leaves source file %s out of the list", (path) => {
		expect(generated(path)).toBe(false);
	});

	const prCheckPatterns = loadGeneratedPaths({ root, scope: "pr-check" });
	test.each([
		"bun.lock",
		"apps/docs/mintlify/docs.json",
		"packages/autumn-js/package.json",
		"packages/atmn/package.json",
		"packages/gateway/package.json",
	])("lists bot-bumped %s for sync but lets PRs edit it", (path) => {
		expect(generated(path)).toBe(true);
		expect(isGeneratedPath({ patterns: prCheckPatterns, path })).toBe(false);
	});
});
