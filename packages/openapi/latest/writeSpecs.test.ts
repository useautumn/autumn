import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDocument, visit } from "yaml";
import {
	writeLatestOpenApi,
	writeLatestOpenApiInternal,
	writeLatestOpenApiStripped,
} from "./openapi";

const countAliases = (text: string) => {
	let aliases = 0;
	visit(parseDocument(text), {
		Alias: () => {
			aliases++;
		},
	});
	return aliases;
};

describe("written OpenAPI specs", () => {
	test.each([
		["openapi.yml", writeLatestOpenApi],
		["openapi-stripped.yml", writeLatestOpenApiStripped],
		["openapi-internal.yml", writeLatestOpenApiInternal],
	])(
		"%s is plain YAML without anchors or aliases",
		async (name, write) => {
			const dir = mkdtempSync(join(tmpdir(), "openapi-spec-"));
			try {
				const outputFilePath = join(dir, name);
				await write({ outputFilePath });
				const text = readFileSync(outputFilePath, "utf8");
				expect(countAliases(text)).toBe(0);
				expect(text).not.toMatch(/^\s*(?:- )?[\w-]+: &\w+/m);
			} finally {
				rmSync(dir, { recursive: true });
			}
		},
		60_000,
	);
});
