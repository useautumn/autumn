/**
 * Pull for plans: versions share a planId, so identity is the stable id first
 * and planId plus versionSlug otherwise; every version is a row in `plans`
 * carrying the `active` the server holds; nested server extras never reach
 * the file.
 */

import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { runPull } from "../src/actions/pull";

const dir = `${import.meta.dir}/.tmp/pull-plans`;
const imports = [
	'import { feature } from "../../../src/generated/features";',
	'import { plan } from "../../../src/generated/plans";',
	'import { variant } from "../../../src/generated/variants";',
	'import { atmn } from "../../../src/generated/wire";',
	"",
].join("\n");

const serverRows = {
	features: [
		{
			id: "seats",
			internalId: "fe_seats",
			name: "Seats",
			type: "boolean",
			consumable: false,
			archived: false,
		},
	],
	plans: [
		{
			id: "pro",
			internalId: "prod_v1",
			name: "Pro",
			version: 1,
			versionSlug: "v1",
			active: false,
			archived: false,
			price: { amount: 39, interval: "month" },
			items: [
				{
					featureId: "seats",
					included: 3,
					entitlementId: "ent_1",
					priceId: "pr_1",
				},
			],
		},
		{
			id: "pro",
			internalId: "prod_v2",
			name: "Pro",
			version: 2,
			versionSlug: "v2",
			active: true,
			archived: false,
			price: { amount: 49, interval: "month" },
			items: [{ featureId: "seats", included: 5, entitlementId: "ent_2" }],
			licenses: [
				{
					licensePlanId: "seat",
					included: 25,
					version: 1,
					versionSlug: "legacy-seat",
					plan: { id: "seat" },
				},
			],
		},
		{
			id: "pro",
			internalId: "prod_v3",
			name: "Pro",
			version: 3,
			versionSlug: "v3",
			active: false,
			archived: false,
			price: { amount: 59, interval: "month" },
			items: [],
		},
	],
};

const previewDeletes = {
	features: [{ featureId: "seats", action: "delete" }],
	plans: [
		{
			planId: "pro",
			version: 1,
			versionSlug: "v1",
			active: false,
			action: "delete",
			internalId: "prod_v1",
			state: { hasCustomers: false },
		},
		{
			planId: "pro",
			version: 2,
			versionSlug: "v2",
			active: true,
			action: "delete",
			internalId: "prod_v2",
			state: { hasCustomers: false },
		},
		{
			planId: "pro",
			version: 3,
			versionSlug: "v3",
			active: false,
			action: "delete",
			internalId: "prod_v3",
			state: { hasCustomers: false },
		},
	],
};

const clientWith = (preview: unknown) => ({
	previewUpdateOrganization: async () => ({ config: { changes: [] } }),
	diff: async () => preview,
	update: async () => ({}),
	get: async () => serverRows,
});

const fresh = (source: string) => {
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	writeFileSync(`${dir}/autumn.config.ts`, source, "utf8");
};
const configText = () => readFileSync(`${dir}/autumn.config.ts`, "utf8");
const executed = async () =>
	// biome-ignore lint/suspicious/noExplicitAny: the executed wire
	(await import(`${dir}/autumn.config.ts?v=${Date.now()}`)).default as any;

test("server-only versions all land in plans, each carrying its active flag", async () => {
	fresh(`${imports}export default atmn({\n\tfeatures: [],\n});\n`);
	const result = await runPull({
		// biome-ignore lint/suspicious/noExplicitAny: a fake client
		client: clientWith(previewDeletes) as any,
		cwd: dir,
		write: () => {},
	});
	expect(result.appended.sort()).toEqual([
		"pro@v1",
		"pro@v2",
		"pro@v3",
		"seats",
	]);

	const text = configText();
	expect(text).toContain("\tplans: [");
	expect(text).not.toContain("planVersions");
	expect(text).not.toContain("entitlementId");
	expect(text).not.toContain("priceId");
	expect(text).not.toContain("plan: {");
	expect(text).toContain('internalId: "prod_v2"');
	expect(text).toContain('internalId: "fe_seats"');
	expect(text).toContain('versionSlug: "legacy-seat"');
	// Every row spells its flag out: membership no longer implies it.
	expect(text.match(/active: true/g)).toHaveLength(1);
	expect(text.match(/active: false/g)).toHaveLength(2);

	const wire = await executed();
	const byVersion = Object.fromEntries(
		wire.plans.map((row: { version_slug: string; active: boolean }) => [
			row.version_slug,
			row.active,
		]),
	);
	expect(byVersion).toEqual({ v1: false, v2: true, v3: false });
});

test("an update is re-placed by its state, found by its stable id even after a rename", async () => {
	fresh(`${imports}export default atmn({
	features: [],
	plans: [
		plan({ internalId: "prod_v2", active: true, planId: "pro_old_name", versionSlug: "v2", name: "Old" }),
	],
});
`);
	const preview = {
		features: [],
		plans: [
			{
				planId: "pro",
				version: 2,
				versionSlug: "v2",
				active: true,
				action: "update",
				internalId: "prod_v2",
				state: { hasCustomers: false },
			},
		],
	};
	const result = await runPull({
		// biome-ignore lint/suspicious/noExplicitAny: a fake client
		client: clientWith(preview) as any,
		cwd: dir,
		write: () => {},
	});
	expect(result.replaced).toEqual(["pro@v2"]);
	expect(configText()).toContain('planId: "pro"');
	expect(configText()).not.toContain("pro_old_name");
	expect(configText()).toContain('name: "Pro"');
});

test("a config-only version is deleted by planId and slug, leaving its sibling", async () => {
	fresh(`${imports}export default atmn({
	features: [],
	plans: [
		plan({ active: true, planId: "pro", versionSlug: "v2", name: "Pro" }),
		plan({ active: false, planId: "pro", versionSlug: "v9", name: "Never pushed" }),
	],
});
`);
	const preview = {
		features: [],
		plans: [
			{
				planId: "pro",
				version: 2,
				versionSlug: "v2",
				active: true,
				action: "none",
				internalId: "prod_v2",
				state: { hasCustomers: false },
			},
			{
				planId: "pro",
				version: 9,
				versionSlug: "v9",
				active: false,
				action: "create",
				internalId: null,
				state: { hasCustomers: false },
			},
		],
	};
	const result = await runPull({
		// biome-ignore lint/suspicious/noExplicitAny: a fake client
		client: clientWith(preview) as any,
		cwd: dir,
		write: () => {},
	});
	expect(result.deleted).toEqual(["pro"]);
	expect(configText()).toContain('versionSlug: "v2"');
	expect(configText()).not.toContain("Never pushed");
});

test("a nested variant is pulled nested, pruned to its fixture shape, with its identity stated", async () => {
	fresh(`${imports}export default atmn({\n\tfeatures: [],\n});\n`);
	const rows = {
		features: [],
		plans: [
			{
				id: "pro",
				internalId: "prod_v1",
				name: "Pro",
				version: 1,
				versionSlug: "v1",
				active: true,
				archived: false,
				items: [],
				variants: [
					{
						variantPlanId: "pro_annual",
						name: "Pro (annual)",
						customize: { price: { amount: 490, interval: "year" } },
						plan: {
							id: "pro_annual",
							internalId: "prod_annual_v1",
							name: "Pro (annual)",
							version: 1,
							versionSlug: "v1",
							active: true,
						},
					},
				],
			},
		],
	};
	const preview = {
		features: [],
		plans: [
			{
				planId: "pro",
				version: 1,
				versionSlug: "v1",
				active: true,
				action: "delete",
				internalId: "prod_v1",
				state: { hasCustomers: false },
			},
		],
	};
	const client = {
		previewUpdateOrganization: async () => ({ config: { changes: [] } }),
		diff: async () => preview,
		update: async () => ({}),
		get: async () => rows,
	};
	// biome-ignore lint/suspicious/noExplicitAny: a fake client
	await runPull({ client: client as any, cwd: dir, write: () => {} });
	const text = configText();
	expect(text).toContain('variantPlanId: "pro_annual"');
	expect(text).toContain("amount: 490");
	expect(text).not.toContain("plan: {");
	expect(text).not.toContain("baseVariantId");
	// The pulled entry is never version-less: id and slug ride on the edge.
	expect(text).toContain(
		'\t\t\t\tvariant({\n\t\t\t\t\tinternalId: "prod_annual_v1",\n\t\t\t\t\tvariantPlanId: "pro_annual",',
	);
	expect(text).toContain('\t\t\t\t\tversionSlug: "v1",\n\t\t\t\t}),');
});

test("a standalone plan's legacy baseVariantId grouping value is never pulled", async () => {
	fresh(`${imports}export default atmn({\n\tfeatures: [],\n});\n`);
	// The server still returns the old monthly/annual grouping id on every
	// plan; pushing it back would read as a variant link the plan never had.
	const rows = {
		features: [],
		plans: [
			{
				id: "max_annual",
				internalId: "prod_max_annual_v1",
				name: "Max (annual)",
				version: 1,
				versionSlug: "v1",
				active: true,
				archived: false,
				baseVariantId: "max_monthly",
				items: [],
			},
		],
	};
	const preview = {
		features: [],
		plans: [
			{
				planId: "max_annual",
				version: 1,
				versionSlug: "v1",
				active: true,
				action: "delete",
				internalId: "prod_max_annual_v1",
				state: { hasCustomers: false },
			},
		],
	};
	const client = {
		previewUpdateOrganization: async () => ({ config: { changes: [] } }),
		diff: async () => preview,
		update: async () => ({}),
		get: async () => rows,
	};
	// biome-ignore lint/suspicious/noExplicitAny: a fake client
	await runPull({ client: client as any, cwd: dir, write: () => {} });
	const text = configText();
	expect(text).toContain('planId: "max_annual"');
	expect(text).not.toContain("baseVariantId");
	expect(text).not.toContain("max_monthly");
});

test("a missing nested variant version is restored to its parent and the second pull converges", async () => {
	fresh(`${imports}export default atmn({
	features: [],
	plans: [
		plan({
			internalId: "team_v1",
			active: true,
			planId: "team",
			name: "Team",
			variants: [
				variant({
					internalId: "team_eu_v1",
					variantPlanId: "team_eu",
					versionSlug: "v1",
				}),
			],
			versionSlug: "v1",
		}),
	],
});
`);
	const rows = {
		features: [],
		plans: [
			{
				id: "team",
				internalId: "team_v1",
				name: "Team",
				version: 1,
				versionSlug: "v1",
				active: true,
				archived: false,
				items: [],
				variants: [
					{
						variantPlanId: "team_eu",
						plan: {
							id: "team_eu",
							internalId: "team_eu_v1",
							version: 1,
							versionSlug: "v1",
							active: false,
						},
					},
					{
						variantPlanId: "team_eu",
						plan: {
							id: "team_eu",
							internalId: "team_eu_v2",
							version: 2,
							versionSlug: "v2",
							active: true,
						},
					},
				],
			},
		],
	};
	const output: string[] = [];
	const client = {
		previewUpdateOrganization: async () => ({ config: { changes: [] } }),
		diff: async (wire: { plans?: Array<{ variants?: unknown[] }> }) => {
			const variants = wire.plans?.flatMap((plan) => plan.variants ?? []) ?? [];
			const hasV2 = variants.some(
				(entry) =>
					(entry as { internal_id?: string }).internal_id === "team_eu_v2",
			);
			return {
				features: [],
				plans: [
					{
						planId: "team",
						version: 1,
						versionSlug: "v1",
						action: "none",
						internalId: "team_v1",
						state: { hasCustomers: false },
					},
					...(hasV2
						? []
						: [
								{
									planId: "team_eu",
									version: 2,
									versionSlug: "v2",
									action: "delete",
									internalId: "team_eu_v2",
									state: { hasCustomers: false },
								},
							]),
				],
			};
		},
		get: async () => rows,
	};

	const first = await runPull({
		// biome-ignore lint/suspicious/noExplicitAny: a fake client
		client: client as any,
		cwd: dir,
		write: (text) => output.push(text),
	});
	expect(first.appended).toEqual(["team_eu@v2"]);
	// Appended beside v1, whose bytes are untouched; never a rewrite of the array.
	expect(configText()).toContain(
		[
			"\t\t\t\tvariant({",
			'\t\t\t\t\tinternalId: "team_eu_v1",',
			'\t\t\t\t\tvariantPlanId: "team_eu",',
			'\t\t\t\t\tversionSlug: "v1",',
			"\t\t\t\t}),",
			"\t\t\t\tvariant({",
			'\t\t\t\t\tinternalId: "team_eu_v2",',
			'\t\t\t\t\tvariantPlanId: "team_eu",',
			'\t\t\t\t\tversionSlug: "v2",',
			"\t\t\t\t}),",
		].join("\n"),
	);
	expect(configText().match(/plan\(\{/g)).toHaveLength(1);

	const afterFirst = configText();
	const second = await runPull({
		// biome-ignore lint/suspicious/noExplicitAny: a fake client
		client: client as any,
		cwd: dir,
		write: (text) => output.push(text),
	});
	expect(second).toMatchObject({ appended: [], replaced: [], deleted: [] });
	expect(configText()).toBe(afterFirst);
	expect(output.at(-1)).toBe("Nothing to pull.\n");
});

/** The scaffolded layout: `plans` is an imported binding holding every version.
 * Each case gets its own directory: bun caches the imported module. */
const bindingImports = [
	'import { atmn } from "../../../src/generated/wire";',
	'import { plans } from "./plans";',
	"",
].join("\n");
const freshWithBinding = ({
	name,
	plans,
}: {
	name: string;
	plans: string;
}): string => {
	const caseDir = `${import.meta.dir}/.tmp/pull-plans-${name}`;
	rmSync(caseDir, { recursive: true, force: true });
	mkdirSync(caseDir, { recursive: true });
	writeFileSync(
		`${caseDir}/autumn.config.ts`,
		`${bindingImports}export default atmn({
	features: [],
	plans,
});
`,
		"utf8",
	);
	writeFileSync(
		`${caseDir}/plans.ts`,
		`import { plan } from "../../../src/generated/plans";

export const plans = [
${plans}
];
`,
		"utf8",
	);
	return caseDir;
};
const rootTextIn = (caseDir: string) =>
	readFileSync(`${caseDir}/autumn.config.ts`, "utf8");
const plansTextIn = (caseDir: string) =>
	readFileSync(`${caseDir}/plans.ts`, "utf8");

/** Version numbers are creation order on the server, so a row pushed after
 * the live one is numbered higher; the slug is what the config names. */
const numberedLaterRows = {
	features: [],
	plans: [
		{
			id: "pro",
			internalId: "prod_v2",
			name: "Pro",
			version: 1,
			versionSlug: "v2",
			active: true,
			archived: false,
			price: { amount: 49, interval: "month" },
			items: [],
		},
		{
			id: "pro",
			internalId: "prod_v1",
			name: "Pro (legacy)",
			version: 3,
			versionSlug: "v1",
			active: false,
			archived: false,
			price: { amount: 39, interval: "month" },
			items: [],
		},
	],
};
const clientFor = ({ preview, rows }: { preview: unknown; rows: unknown }) =>
	({
		previewUpdateOrganization: async () => ({ config: { changes: [] } }),
		diff: async () => preview,
		update: async () => ({}),
		get: async () => rows,
		// biome-ignore lint/suspicious/noExplicitAny: a fake client
	}) as any;
const liveV2Entry = {
	planId: "pro",
	version: 1,
	versionSlug: "v2",
	active: true,
	action: "none",
	internalId: "prod_v2",
	state: { hasCustomers: false },
};

test("a version the server numbered later is rewritten where it is, in the binding", async () => {
	const caseDir = freshWithBinding({
		name: "stays",
		plans: [
			'\tplan({ internalId: "prod_v2", active: true, planId: "pro", versionSlug: "v2", name: "Pro" }),',
			'\tplan({ internalId: "prod_v1", active: false, planId: "pro", versionSlug: "v1", name: "Pro" }),',
		].join("\n"),
	});
	const preview = {
		features: [],
		plans: [
			liveV2Entry,
			{
				planId: "pro",
				version: 3,
				versionSlug: "v1",
				active: false,
				action: "update",
				internalId: "prod_v1",
				state: { hasCustomers: false },
			},
		],
	};
	const result = await runPull({
		client: clientFor({ preview, rows: numberedLaterRows }),
		cwd: caseDir,
		write: () => {},
	});
	expect(result.replaced).toEqual(["pro@v1"]);
	expect(result.appended).toEqual([]);
	expect(plansTextIn(caseDir)).toContain('name: "Pro (legacy)"');
	expect(plansTextIn(caseDir)).toContain('internalId: "prod_v1"');
	expect(plansTextIn(caseDir).match(/plan\(\{/g)?.length ?? 0).toBe(2);
	expect(rootTextIn(caseDir)).not.toContain("plan(");
});

test("an unstated older version is appended into the imported plans binding", async () => {
	const caseDir = freshWithBinding({
		name: "unstated",
		plans:
			'\tplan({ internalId: "prod_v2", active: true, planId: "pro", versionSlug: "v2", name: "Pro" }),',
	});
	const rows = {
		features: [],
		plans: [
			{ ...numberedLaterRows.plans[0], version: 2 },
			{
				...numberedLaterRows.plans[1],
				version: 1,
				variants: [
					{
						variantPlanId: "pro_annual",
						name: "Pro Annual",
						plan: {
							internalId: "prod_annual_v1",
							versionSlug: "v1",
						},
					},
				],
			},
		],
	};
	const result = await runPull({
		client: clientFor({
			preview: { features: [], plans: [liveV2Entry] },
			rows,
		}),
		cwd: caseDir,
		write: () => {},
	});
	expect(result.appended).toEqual(["pro@v1"]);
	expect(plansTextIn(caseDir)).toContain('internalId: "prod_v1"');
	expect(plansTextIn(caseDir)).toContain("active: false");
	expect(plansTextIn(caseDir)).toContain(
		'import { variant } from "../../../src/generated/variants";',
	);
	expect(plansTextIn(caseDir)).toContain(
		'variants: [\n\t\t\tvariant({\n\t\t\t\tinternalId: "prod_annual_v1"',
	);
	expect(rootTextIn(caseDir)).not.toContain("plan(");
});

test("a row the server superseded keeps its place and flips active in the fixture", async () => {
	const caseDir = freshWithBinding({
		name: "flips",
		plans:
			'\tplan({ internalId: "prod_v1", active: true, planId: "pro", versionSlug: "v1", name: "Pro" }),',
	});
	const preview = {
		features: [],
		plans: [
			{
				planId: "pro",
				version: 3,
				versionSlug: "v1",
				active: false,
				action: "update",
				internalId: "prod_v1",
				planChange: { previousAttributes: { active: true }, itemChanges: [] },
				state: { hasCustomers: false },
			},
		],
	};
	const result = await runPull({
		client: clientFor({ preview, rows: numberedLaterRows }),
		cwd: caseDir,
		write: () => {},
	});
	expect(result.replaced).toEqual(["pro@v1"]);
	// The live row the config never stated arrives beside it.
	expect(result.appended).toEqual(["pro@v2"]);
	const text = plansTextIn(caseDir);
	expect(text).toContain('internalId: "prod_v1"');
	expect(text).toContain('internalId: "prod_v2"');
	expect(text.match(/active: false/g)).toHaveLength(1);
	expect(text.match(/active: true/g)).toHaveLength(1);
});

test("a sibling version demoted under the edited row flips active where it sits", async () => {
	const caseDir = freshWithBinding({
		name: "sibling",
		plans: [
			'\tplan({ internalId: "prod_v1", active: true, planId: "pro", versionSlug: "v1", name: "Pro" }),',
			'\tplan({ internalId: "prod_v2", active: false, planId: "pro", versionSlug: "v2", name: "Pro" }),',
		].join("\n"),
	});
	const rows = {
		features: [],
		plans: [
			{ ...numberedLaterRows.plans[0], version: 2, active: true },
			{ ...numberedLaterRows.plans[1], version: 1, active: false },
		],
	};
	const preview = {
		features: [],
		plans: [
			{
				...liveV2Entry,
				action: "create",
				internalId: null,
				siblingVersions: [
					{
						planId: "pro",
						version: 1,
						versionSlug: "v1",
						active: false,
						internalId: "prod_v1",
						planChange: {
							previousAttributes: { active: true },
							itemChanges: [],
						},
					},
				],
			},
		],
	};
	const result = await runPull({
		client: clientFor({ preview, rows }),
		cwd: caseDir,
		write: () => {},
	});
	expect(result.replaced).toEqual(["pro@v1"]);
	const text = plansTextIn(caseDir);
	// Only the named field moves; the fixture keeps its other bytes.
	expect(text).toContain(
		'plan({ internalId: "prod_v1", active: false, planId: "pro", versionSlug: "v1", name: "Pro" })',
	);
	// The config-only v2 was a create on the server: it is dropped, not kept.
	expect(text).not.toContain('internalId: "prod_v2"');
});

test("a version pulled for the first time lands beside its plan's other versions", async () => {
	const caseDir = freshWithBinding({
		name: "beside",
		plans: [
			'\tplan({ internalId: "prod_v1", active: true, planId: "pro", versionSlug: "v1", name: "Pro" }),',
			'\tplan({ internalId: "prod_free", active: true, planId: "free", versionSlug: "v1", name: "Free" }),',
		].join("\n"),
	});
	const rows = {
		features: [],
		plans: [
			...numberedLaterRows.plans,
			{
				id: "free",
				internalId: "prod_free",
				name: "Free",
				version: 1,
				versionSlug: "v1",
				active: true,
				archived: false,
				price: null,
				items: [],
			},
		],
	};
	const preview = {
		features: [],
		plans: [
			{
				planId: "pro",
				version: 1,
				versionSlug: "v2",
				active: true,
				action: "delete",
				internalId: "prod_v2",
				state: { hasCustomers: false },
			},
		],
	};
	const result = await runPull({
		client: clientFor({ preview, rows }),
		cwd: caseDir,
		write: () => {},
	});
	expect(result.appended).toEqual(["pro@v2"]);
	const text = plansTextIn(caseDir);
	const order = [...text.matchAll(/internalId: "(\w+)"/g)].map((m) => m[1]);
	expect(order).toEqual(["prod_v1", "prod_v2", "prod_free"]);
});
