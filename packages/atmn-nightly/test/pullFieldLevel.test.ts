/**
 * Pull patches only the fields the preview names: a renamed plan keeps its
 * one-line shape, a changed name moves alone, and a diff that names no fields
 * still rewrites the whole fixture.
 */

import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { runPull } from "../src/actions/pull";

const dir = `${import.meta.dir}/.tmp/pull-field-level`;
const imports = [
	'import { plan } from "../../../src/generated/plans";',
	'import { atmn } from "../../../src/generated/wire";',
	"",
].join("\n");

const serverRows = (pro: Record<string, unknown>) => ({
	features: [],
	plans: [
		{
			id: "free",
			internalId: "prod_A",
			name: "Free",
			version: 1,
			versionSlug: "v1",
			active: true,
			archived: false,
			items: [],
		},
		{
			internalId: "prod_B",
			version: 1,
			versionSlug: "v1",
			active: true,
			archived: false,
			price: { amount: 49, interval: "month" },
			items: [],
			...pro,
		},
	],
});

const clientWith = ({
	preview,
	rows,
}: {
	preview: unknown;
	rows: unknown;
}) => ({
	previewUpdate: async () => preview,
	update: async () => ({}),
	get: async () => rows,
});

const config = `${imports}export default atmn({
	plans: [
		plan({ internalId: "prod_A", planId: "free", name: "Free" }),
		plan({ internalId: "prod_B", planId: "pro", name: "Pro", price: { amount: 49, interval: "month" } }),
	],
});
`;

const fresh = () => {
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	writeFileSync(`${dir}/autumn.config.ts`, config, "utf8");
};
const configText = () => readFileSync(`${dir}/autumn.config.ts`, "utf8");

const pull = async ({ preview, rows }: { preview: unknown; rows: unknown }) =>
	runPull({
		// biome-ignore lint/suspicious/noExplicitAny: a fake client
		client: clientWith({ preview, rows }) as any,
		cwd: dir,
		write: () => {},
	});

test("a plan renamed on the server moves only its planId", async () => {
	fresh();
	const result = await pull({
		rows: serverRows({ id: "proNew", name: "Pro" }),
		preview: {
			features: [],
			plans: [
				{
					planId: "proNew",
					newPlanId: "pro",
					internalId: "prod_B",
					version: 1,
					versionSlug: "v1",
					active: true,
					action: "update",
					state: {},
				},
			],
		},
	});
	expect(result.replaced).toEqual(["proNew@v1"]);
	expect(configText()).toBe(
		config.replace(
			'planId: "pro", name: "Pro"',
			'planId: "proNew", name: "Pro"',
		),
	);
});

test("a changed name moves alone and the fixture keeps its bytes", async () => {
	fresh();
	await pull({
		rows: serverRows({ id: "pro", name: "Pro Plus" }),
		preview: {
			features: [],
			plans: [
				{
					planId: "pro",
					internalId: "prod_B",
					version: 1,
					versionSlug: "v1",
					active: true,
					action: "update",
					state: {},
					planChange: { previousAttributes: { name: "Pro" }, itemChanges: [] },
				},
			],
		},
	});
	expect(configText()).toBe(config.replace('name: "Pro"', 'name: "Pro Plus"'));
});

test("a price change patches the price and adds a field the config never had", async () => {
	fresh();
	await pull({
		rows: serverRows({
			id: "pro",
			name: "Pro",
			group: "core",
			price: { amount: 59, interval: "month" },
		}),
		preview: {
			features: [],
			plans: [
				{
					planId: "pro",
					internalId: "prod_B",
					version: 1,
					versionSlug: "v1",
					active: true,
					action: "update",
					state: {},
					planChange: {
						previousAttributes: { group: null },
						priceChange: { previous: { amount: 49 }, current: { amount: 59 } },
						itemChanges: [],
					},
				},
			],
		},
	});
	const text = configText();
	expect(text).toContain('planId: "free", name: "Free" }),');
	expect(text).toContain("amount: 59");
	expect(text).not.toContain("amount: 49");
	expect(text).toContain('group: "core"');
	expect(text.split("\n")).toHaveLength(config.split("\n").length + 3);
});

test("a diff that names no fields rewrites the whole fixture", async () => {
	fresh();
	await pull({
		rows: serverRows({ id: "pro", name: "Pro", group: "core" }),
		preview: {
			features: [],
			plans: [
				{
					planId: "pro",
					internalId: "prod_B",
					version: 1,
					versionSlug: "v1",
					active: true,
					action: "update",
					state: {},
				},
			],
		},
	});
	const text = configText();
	expect(text).toContain('group: "core"');
	expect(text).toContain("plan({\n");
});
