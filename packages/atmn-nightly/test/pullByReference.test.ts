/** Fixtures exported by name and listed by reference: an update rewrites the
 * export where it is, a delete removes the export and the reference, a
 * server-only row is appended inline, and the result parses. */

import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { Lang, parse } from "@ast-grep/napi";
import { runPull } from "../src/actions/pull";

const dir = `${import.meta.dir}/.tmp/pull-by-reference`;
const planImport = 'import { plan } from "../../../src/generated/plans";';

const rows = {
	features: [],
	plans: [
		{
			id: "keep",
			internalId: "prod_keep",
			name: "Keep",
			version: 1,
			versionSlug: "v1",
			active: true,
			archived: false,
			price: { amount: 15, interval: "month" },
			items: [],
		},
		{
			id: "added",
			internalId: "prod_added",
			name: "Added",
			version: 1,
			versionSlug: "v1",
			active: true,
			archived: false,
			items: [],
		},
	],
};
const preview = {
	features: [],
	plans: [
		{
			planId: "keep",
			version: 1,
			versionSlug: "v1",
			active: true,
			action: "update",
			internalId: "prod_keep",
			state: {},
		},
		{
			planId: "gone",
			version: 1,
			versionSlug: "v1",
			active: true,
			action: "create",
			internalId: null,
			state: {},
		},
		{
			planId: "added",
			version: 1,
			versionSlug: "v1",
			active: true,
			action: "delete",
			internalId: "prod_added",
			state: {},
		},
	],
};
const client = {
	previewUpdate: async () => preview,
	update: async () => ({}),
	get: async () => rows,
};

test("by-reference layout: update in place, delete export and reference, append inline, still parses", async () => {
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		`${dir}/autumn.config.ts`,
		'import { gone, keep } from "./plans";\nimport { atmn } from "../../../src/generated/wire";\nexport default atmn({ plans: [keep, gone] });\n',
	);
	writeFileSync(
		`${dir}/plans.ts`,
		`${planImport}\nexport const keep = plan({ internalId: "prod_keep", planId: "keep", name: "Keep", price: { amount: 10, interval: "month" } });\nexport const gone = plan({ planId: "gone", name: "Gone", price: { amount: 20, interval: "month" } });\n`,
	);
	// biome-ignore lint/suspicious/noExplicitAny: a fake client
	const result = await runPull({
		client: client as any,
		cwd: dir,
		write: () => {},
	});
	const root = readFileSync(`${dir}/autumn.config.ts`, "utf8");
	const plans = readFileSync(`${dir}/plans.ts`, "utf8");
	expect(result.deleted).toEqual(["gone"]);
	expect(result.replaced).toEqual(["keep@v1"]);
	expect(result.appended).toEqual(["added@v1"]);
	expect(plans).not.toContain("export const gone");
	expect(plans).toContain("amount: 15");
	expect(root).toContain('import { keep } from "./plans"');
	expect(root).toContain('internalId: "prod_added"');
	for (const [name, text] of [
		["root", root],
		["plans", plans],
	]) {
		const errors = parse(Lang.TypeScript, text)
			.root()
			.findAll({ rule: { kind: "ERROR" } });
		expect(`${name}: ${errors.map((e) => e.text()).join(" | ")}`).toBe(
			`${name}: `,
		);
	}
	// biome-ignore lint/suspicious/noExplicitAny: a fake client
	const second = await runPull({
		client: {
			...client,
			previewUpdate: async () => ({
				features: [],
				plans: preview.plans.map((row) => ({ ...row, action: "none" })),
			}),
		} as any,
		cwd: dir,
		write: () => {},
	});
	expect(second.appended).toEqual([]);
	expect(readFileSync(`${dir}/autumn.config.ts`, "utf8")).toBe(root);
});
