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
		/written for atmn 1\.x.*atmn pull --overwrite --yes/s,
	);
});

test("v2 named fixture exports are named as a v2 config too", async () => {
	const dir = write({
		dir: `${import.meta.dir}/.tmp/v2-named`,
		source: `export const seats = { id: "seats", name: "Seats", type: "boolean" };
export const pro = { id: "pro", name: "Pro", items: [] };
`,
	});
	await expect(loadConfig({ dirs: [dir] })).rejects.toThrow(
		/written for atmn 1\.x/,
	);
});

test("a v2 plan without items is still a v2 config", async () => {
	const dir = write({
		dir: `${import.meta.dir}/.tmp/v2-empty-plan`,
		source: `export const pro = { id: "pro", name: "Pro", is_add_on: false };
`,
	});
	await expect(loadConfig({ dirs: [dir] })).rejects.toThrow(
		/written for atmn 1\.x/,
	);
});

test("a v2 default object beside named fixtures is still a v2 config", async () => {
	const dir = write({
		dir: `${import.meta.dir}/.tmp/v2-default-and-named`,
		source: `export const seats = { id: "seats", name: "Seats", type: "boolean" };
export default { name: "my catalog" };
`,
	});
	await expect(loadConfig({ dirs: [dir] })).rejects.toThrow(
		/written for atmn 1\.x/,
	);
});

test("an explicit -c that does not exist is an error, never another config", async () => {
	const dir = `${import.meta.dir}/.tmp/explicit-missing`;
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		`${dir}/autumn.config.ts`,
		`export default { skip_deletions: false, features: [] };\n`,
	);
	await expect(
		loadConfig({ dirs: [dir], configPath: `${dir}/typo.config.ts` }),
	).rejects.toThrow(/typo\.config\.ts/);
	rmSync(dir, { recursive: true, force: true });
});
