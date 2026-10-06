import { describe, expect, test } from "bun:test";
import {
	findGeneratedEdits,
	listPullRequestFiles,
} from "./check-generated-paths";

const list = [
	"packages/sdk/src/models/",
	"packages/openapi/openapi.yml",
	"apps/docs/mintlify/api-reference/core/",
	"# sync-only",
	"bun.lock",
	"packages/autumn-js/package.json",
].join("\n");

describe("generated paths PR check", () => {
	test("flags edits to generated files", () => {
		expect(
			findGeneratedEdits({
				list,
				files: [
					"server/src/index.ts",
					"packages/sdk/src/models/customer.ts",
					"packages/openapi/openapi.yml",
				],
			}),
		).toEqual([
			"packages/sdk/src/models/customer.ts",
			"packages/openapi/openapi.yml",
		]);
	});

	test("passes PRs that only touch source", () => {
		expect(
			findGeneratedEdits({
				list,
				files: ["shared/api/customers.ts", "packages/openapi/api.ts"],
			}),
		).toEqual([]);
	});

	test("lets PRs edit sync-only files such as manifests and the lockfile", () => {
		expect(
			findGeneratedEdits({
				list,
				files: ["bun.lock", "packages/autumn-js/package.json"],
			}),
		).toEqual([]);
	});

	test("ignores blank input lines", () => {
		expect(findGeneratedEdits({ list, files: ["", "  "] })).toEqual([]);
	});
});

describe("pull request files", () => {
	test("pages through the files API and includes the old side of renames", async () => {
		const requested: string[] = [];
		const pages: Record<string, unknown[]> = {
			"1": [
				...Array.from({ length: 99 }, (_, i) => ({ filename: `src/${i}.ts` })),
				{
					filename: "src/new.ts",
					previous_filename: "packages/openapi/openapi.yml",
				},
			],
			"2": [{ filename: "README.md" }],
			"3": [],
		};
		const files = await listPullRequestFiles({
			ctx: {
				fetch: async (url: string, init?: RequestInit) => {
					requested.push(url);
					expect(new Headers(init?.headers).get("authorization")).toBe(
						"Bearer t",
					);
					return Response.json(
						pages[new URL(url).searchParams.get("page") ?? ""],
					);
				},
			},
			repository: "o/r",
			number: 7,
			token: "t",
		});
		expect(files).toHaveLength(102);
		expect(files).toContain("packages/openapi/openapi.yml");
		expect(files.at(-1)).toBe("README.md");
		expect(requested[0]).toBe(
			"https://api.github.com/repos/o/r/pulls/7/files?per_page=100&page=1",
		);
		expect(requested).toHaveLength(2);
	});

	test("fails loudly when the API errors", async () => {
		await expect(
			listPullRequestFiles({
				ctx: { fetch: async () => new Response("nope", { status: 403 }) },
				repository: "o/r",
				number: 7,
				token: "t",
			}),
		).rejects.toThrow("403");
	});
});
