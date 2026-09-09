/**
 * A plan's `config` is one the server always answers with, but a fixture
 * reads the same without it while every flag sits at its default: a pull
 * leaves it out, and removes one that has drifted back to default.
 */

import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { runPull } from "../src/actions/pull";
import { COLLECTIONS } from "../src/generated/emit";
import { emitFixture } from "../src/generated/emitRuntime";

const dir = `${import.meta.dir}/.tmp/pull-omit-default-config`;
const imports = [
	'import { plan } from "../../../src/generated/plans";',
	'import { atmn } from "../../../src/generated/wire";',
	"",
].join("\n");

const proRow = (config: Record<string, unknown>) => ({
	id: "pro",
	internalId: "prod_B",
	name: "Pro",
	version: 1,
	versionSlug: "v1",
	active: true,
	archived: false,
	items: [],
	config,
});

const configChange = (previous: Record<string, unknown>) => ({
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
			planChange: { previousAttributes: { config: previous }, itemChanges: [] },
		},
	],
});

const writeConfig = (source: string) => {
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	writeFileSync(`${dir}/autumn.config.ts`, `${imports}${source}`, "utf8");
};
const configText = () => readFileSync(`${dir}/autumn.config.ts`, "utf8");

const pull = async ({ preview, rows }: { preview: unknown; rows: unknown }) =>
	runPull({
		client: {
			previewUpdateOrganization: async () => ({ config: { changes: [] } }),
			previewUpdate: async () => preview,
			update: async () => ({}),
			get: async () => rows,
			// biome-ignore lint/suspicious/noExplicitAny: a fake client
		} as any,
		cwd: dir,
		write: () => {},
	});

test("the generated spec names config as omitted at its default", () => {
	expect(COLLECTIONS.plans.omitWhenDefault).toEqual([
		{ path: "config", default: { ignorePastDue: false } },
	]);
});

test("a whole-fixture emit leaves config out at default and keeps it when a flag is on", () => {
	const at = (config: Record<string, unknown>) =>
		emitFixture({
			spec: COLLECTIONS.plans,
			row: proRow(config),
			includeMappings: false,
			indent: "",
		});
	expect(at({ ignorePastDue: false })).not.toContain("config");
	expect(at({ ignorePastDue: true })).toContain(
		"config: {\n\t\tignorePastDue: true,\n\t}",
	);
});

test("a flag switched on appends config to a fixture that never stated it", async () => {
	writeConfig(`export default atmn({
	plans: [
		plan({ internalId: "prod_B", planId: "pro", versionSlug: "v1", name: "Pro" }),
	],
});
`);
	await pull({
		rows: { features: [], plans: [proRow({ ignorePastDue: true })] },
		preview: configChange({ ignore_past_due: false }),
	});
	expect(configText()).toMatch(/config: \{\s*ignorePastDue: true,?\s*\}/);
});

test("a flag switched off removes the config pair instead of writing the default", async () => {
	writeConfig(`export default atmn({
	plans: [
		plan({ internalId: "prod_B", planId: "pro", versionSlug: "v1", name: "Pro", config: { ignorePastDue: true } }),
	],
});
`);
	await pull({
		rows: { features: [], plans: [proRow({ ignorePastDue: false })] },
		preview: configChange({ ignore_past_due: true }),
	});
	const text = configText();
	expect(text).not.toContain("config");
	expect(text).toContain(
		'plan({ internalId: "prod_B", planId: "pro", versionSlug: "v1", name: "Pro" }),',
	);
});
