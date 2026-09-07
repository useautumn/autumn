/**
 * A v2 config in a v3 directory is the migration case: name it, and say what
 * to do, instead of "no default export".
 */

import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { loadConfig } from "../src/config/loadConfig";

const write = ({ dir, source }: { dir: string; source: string }): string => {
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	writeFileSync(`${dir}/autumn.config.ts`, source, "utf8");
	return dir;
};

test("a v2 default export is named as a v2 config, with the way out", async () => {
	const dir = write({
		dir: `${import.meta.dir}/.tmp/v2-config`,
		source: `export default {
	features: [{ id: "seats", name: "Seats", type: "boolean" }],
	products: [{ id: "pro", name: "Pro", items: [] }],
};
`,
	});
	await expect(loadConfig({ dirs: [dir] })).rejects.toThrow(
		/atmn v2 config.*move this file aside.*atmn pull/s,
	);
});

test("v2 named fixture exports are named as a v2 config too", async () => {
	const dir = write({
		dir: `${import.meta.dir}/.tmp/v2-named`,
		source: `export const seats = { id: "seats", name: "Seats", type: "boolean" };
export const pro = { id: "pro", name: "Pro", items: [] };
`,
	});
	await expect(loadConfig({ dirs: [dir] })).rejects.toThrow(/atmn v2 config/);
});

test("a v2 plan without items is still a v2 config", async () => {
	// An empty plan states no items; the product's own settings name the row.
	const dir = write({
		dir: `${import.meta.dir}/.tmp/v2-empty-plan`,
		source: `export const pro = { id: "pro", name: "Pro", is_add_on: false };
`,
	});
	await expect(loadConfig({ dirs: [dir] })).rejects.toThrow(/atmn v2 config/);
});

test("a v2 default object beside named fixtures is still a v2 config", async () => {
	// The default carries no products/features array, so only the named
	// fixtures give it away.
	const dir = write({
		dir: `${import.meta.dir}/.tmp/v2-default-and-named`,
		source: `export const seats = { id: "seats", name: "Seats", type: "boolean" };
export default { name: "my catalog" };
`,
	});
	await expect(loadConfig({ dirs: [dir] })).rejects.toThrow(/atmn v2 config/);
});
