import { describe, expect, test } from "bun:test";
import { findGeneratedEdits } from "./check-generated-paths";

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
