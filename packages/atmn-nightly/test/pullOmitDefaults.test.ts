/**
 * A value at its spec default reads the same when omitted, so a pull leaves
 * it out at any depth, drops a container that ends up empty, and removes a
 * stated pair that has drifted back to default. `items: []` carries no
 * default and still states "none".
 */

import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { runPull } from "../src/actions/pull";
import { COLLECTIONS } from "../src/generated/emit";
import { emitFixture } from "../src/generated/emitRuntime";

const dir = `${import.meta.dir}/.tmp/pull-omit-defaults`;
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

test("the generated spec carries the defaults the emitter elides", () => {
	expect(COLLECTIONS.plans.defaults).toMatchObject({
		addOn: false,
		autoEnable: false,
		metadata: {},
		"config.ignorePastDue": false,
		"price.intervalCount": 1,
		"items.reset.intervalCount": 1,
		"items.price.billingUnits": 1,
		"freeTrial.cardRequired": false,
		"freeTrial.onEnd": "bill",
		"billingControls.usageLimits": [],
		"billingControls.usageLimits.enabled": true,
	});
	expect(COLLECTIONS.plans.defaults).not.toHaveProperty("items");
	expect(COLLECTIONS.features.defaults).toEqual({});
	expect(COLLECTIONS.plans.keys).not.toContain("isDefault");
	expect(COLLECTIONS.features.keys).not.toContain("display");
});

const emitPlan = (extra: Record<string, unknown>): string =>
	emitFixture({
		spec: COLLECTIONS.plans,
		row: { ...proRow({ ignorePastDue: false }), ...extra },
		includeMappings: false,
		indent: "",
	});

test("scalar defaults vanish at any depth and non-defaults stay", () => {
	const text = emitPlan({
		addOn: false,
		autoEnable: false,
		isDefault: false,
		metadata: {},
		price: { amount: 49, interval: "month", intervalCount: 1 },
		items: [
			{
				featureId: "api",
				included: 10,
				reset: { interval: "month", intervalCount: 1 },
				price: { amount: 1, billingUnits: 1, billingMethod: "usage" },
				pooled: false,
			},
		],
		freeTrial: {
			durationLength: 14,
			durationType: "day",
			cardRequired: false,
			onEnd: "bill",
		},
	});
	for (const absent of [
		"addOn",
		"autoEnable",
		"isDefault",
		"metadata",
		"intervalCount",
		"billingUnits",
		"pooled",
		"cardRequired",
		"onEnd",
		"config",
	])
		expect(text).not.toContain(absent);
	expect(text).toContain('durationType: "day"');
	const stated = emitPlan({
		addOn: true,
		price: { amount: 49, interval: "month", intervalCount: 3 },
	});
	expect(stated).toMatch(/\n\taddOn: true,/);
	expect(stated).toMatch(
		/price: \{\n\t\tamount: 49,\n\t\tinterval: "month",\n\t\tintervalCount: 3,\n\t\}/,
	);
});

test("billing controls: no lanes → no key; one lane → only that lane, row defaults elided", () => {
	const empty = emitPlan({
		billingControls: {
			autoTopups: [],
			spendLimits: [],
			usageLimits: [],
			usageAlerts: [],
			overageAllowed: [],
		},
	});
	expect(empty).not.toContain("billingControls");
	expect(emitPlan({ billingControls: {} })).not.toContain("billingControls");
	const one = emitPlan({
		billingControls: {
			autoTopups: [],
			usageLimits: [
				{ featureId: "api", enabled: true, limit: 1000, interval: "month" },
			],
		},
	});
	expect(one).toContain("usageLimits");
	expect(one).not.toContain("autoTopups");
	expect(one).not.toContain("enabled");
	expect(one).toContain("limit: 1000");
	// An all-default row is still a row: it stays as {}, never null.
	const bare = emitPlan({
		billingControls: { spendLimits: [{ enabled: false }] },
	});
	expect(bare).toContain("spendLimits: [\n\t\t\t{},\n\t\t],");
	expect(bare).not.toContain("null");
});

test("an empty items array is a statement and is kept", () => {
	expect(emitPlan({ items: [] })).toContain("items: []");
});

test("a feature's display is not written; a classic credit system keeps an empty creditSchema", () => {
	const text = emitFixture({
		spec: COLLECTIONS.features,
		row: {
			id: "api",
			name: "API",
			type: "metered",
			consumable: true,
			archived: false,
			display: { singular: "call", plural: "calls" },
		},
		includeMappings: false,
		indent: "",
	});
	expect(text).not.toContain("display");
	const credits = emitFixture({
		spec: COLLECTIONS.features,
		row: {
			id: "credits",
			name: "Credits",
			type: "credit_system",
			archived: false,
			creditSchema: [],
		},
		includeMappings: false,
		indent: "",
	});
	expect(credits).toContain("creditSchema: []");
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
