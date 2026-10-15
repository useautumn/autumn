import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	isStableSdkFile,
	resolveSchemaSources,
	SCHEMA_SOURCES,
} from "./zodSchemaGeneration.js";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true });
});

const modelsDir = (files: Record<string, string>) => {
	const dir = mkdtempSync(path.join(tmpdir(), "sdk-models-"));
	dirs.push(dir);
	for (const [name, text] of Object.entries(files)) {
		writeFileSync(path.join(dir, name), text);
	}
	return dir;
};

describe("SCHEMA_SOURCES", () => {
	test("never names a Speakeasy-hoisted model file, whose name changes with the spec", () => {
		const hoisted = SCHEMA_SOURCES.flatMap((source) =>
			"sdkFile" in source && !isStableSdkFile(source.sdkFile)
				? [source.sdkFile]
				: [],
		);
		expect(hoisted).toEqual([]);
	});

	test("the list plans params come from the ListPlansParams type, wherever it lives", () => {
		expect(
			SCHEMA_SOURCES.find(
				(source) => source.outputFile === "listPlansParamsSchemas.ts",
			),
		).toEqual({
			exportedType: "ListPlansParams",
			outputFile: "listPlansParamsSchemas.ts",
		});
	});

	test("output files are unique", () => {
		const outputs = SCHEMA_SOURCES.map((source) => source.outputFile);
		expect(new Set(outputs).size).toBe(outputs.length);
	});
});

describe("isStableSdkFile", () => {
	test.each([
		["list-plans-op.ts", true],
		["list-plans-response.ts", true],
		["list-plans-variant-details-usage-alert.ts", false],
		["list-plans-variant-details-basis.ts", false],
	])("%s → %s", (file, stable) => {
		expect(isStableSdkFile(file)).toBe(stable);
	});
});

describe("resolveSchemaSources", () => {
	test("finds a type by name after Speakeasy renames its file", () => {
		const dir = modelsDir({
			"list-plans-response.ts": "export type ListPlansResponse = {};\n",
			"list-plans-variant-details-basis.ts":
				"export type ListPlansGlobals = {};\nexport type ListPlansParams = {\n  customerId?: string;\n};\n",
		});
		expect(
			resolveSchemaSources({
				sdkModelsDir: dir,
				sources: [
					{ sdkFile: "list-plans-response.ts", outputFile: "a.ts" },
					{ exportedType: "ListPlansParams", outputFile: "b.ts" },
				],
			}),
		).toEqual([
			{ sdkFile: "list-plans-response.ts", outputFile: "a.ts" },
			{ sdkFile: "list-plans-variant-details-basis.ts", outputFile: "b.ts" },
		]);
	});

	test("a type name that's only a prefix of another doesn't match", () => {
		const dir = modelsDir({
			"x.ts": "export type ListPlansParamsExtra = {};\n",
		});
		expect(() =>
			resolveSchemaSources({
				sdkModelsDir: dir,
				sources: [{ exportedType: "ListPlansParams", outputFile: "b.ts" }],
			}),
		).toThrow("ListPlansParams");
	});

	test("lists every missing source in one error", () => {
		const dir = modelsDir({ "other.ts": "export type Other = {};\n" });
		expect(() =>
			resolveSchemaSources({
				sdkModelsDir: dir,
				sources: [
					{ sdkFile: "gone-op.ts", outputFile: "a.ts" },
					{ exportedType: "ListPlansParams", outputFile: "b.ts" },
				],
			}),
		).toThrow(/gone-op\.ts -> a\.ts[\s\S]*ListPlansParams -> b\.ts/);
	});

	test("refuses a type exported from more than one file", () => {
		const dir = modelsDir({
			"a.ts": "export type ListPlansParams = {};\n",
			"b.ts": "export type ListPlansParams = {};\n",
		});
		expect(() =>
			resolveSchemaSources({
				sdkModelsDir: dir,
				sources: [{ exportedType: "ListPlansParams", outputFile: "b.ts" }],
			}),
		).toThrow(/a\.ts, b\.ts/);
	});
});
