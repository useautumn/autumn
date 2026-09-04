/**
 * Pull for plans: versions share a planId, so identity is the stable id first
 * and planId plus versionSlug otherwise; the active row lands in `plans`, a
 * newer inactive row is a draft in `plans` with `active: false`, older rows
 * are history in `planVersions`; nested server extras never reach the file.
 */

import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { runPull } from "../src/actions/pull";

const dir = `${import.meta.dir}/.tmp/pull-plans`;
const imports = [
	'import { feature } from "../../../src/generated/features";',
	'import { plan } from "../../../src/generated/plans";',
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
	previewUpdate: async () => preview,
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

test("server-only versions are routed: active to plans, draft to plans with active false, old to planVersions", async () => {
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
	expect(text).toContain("\tplanVersions: [");
	expect(text).not.toContain("entitlementId");
	expect(text).not.toContain("priceId");
	expect(text).not.toContain("plan: {");
	expect(text).toContain('internalId: "prod_v2"');
	expect(text).toContain('internalId: "fe_seats"');

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
		plan({ internalId: "prod_v2", planId: "pro_old_name", versionSlug: "v2", name: "Old" }),
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
		plan({ planId: "pro", versionSlug: "v2", name: "Pro" }),
		plan({ planId: "pro", versionSlug: "v9", name: "Never pushed" }),
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

test("a nested variant is pulled nested, pruned to its fixture shape", async () => {
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
							name: "Pro (annual)",
							version: 1,
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
		previewUpdate: async () => preview,
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
});

/** The fresh-key layout: history lives in its own file, wired by an import.
 * Each case gets its own directory: bun caches the imported history module. */
const historyImports = [
	'import { plan } from "../../../src/generated/plans";',
	'import { atmn } from "../../../src/generated/wire";',
	'import { proVersions } from "./planVersions/pro";',
	"",
].join("\n");
const freshWithHistory = ({
	name,
	rootPlans,
	history,
}: {
	name: string;
	rootPlans: string;
	history: string;
}): string => {
	const historyDir = `${import.meta.dir}/.tmp/pull-plans-${name}`;
	rmSync(historyDir, { recursive: true, force: true });
	mkdirSync(`${historyDir}/planVersions`, { recursive: true });
	writeFileSync(
		`${historyDir}/autumn.config.ts`,
		`${historyImports}export default atmn({
	features: [],
	plans: [
${rootPlans}
	],
	planVersions: proVersions,
});
`,
		"utf8",
	);
	writeFileSync(
		`${historyDir}/planVersions/pro.ts`,
		`import { plan } from "../../../../src/generated/plans";

export const proVersions = [
${history}
];
`,
		"utf8",
	);
	return historyDir;
};
const rootTextIn = (historyDir: string) =>
	readFileSync(`${historyDir}/autumn.config.ts`, "utf8");
const historyTextIn = (historyDir: string) =>
	readFileSync(`${historyDir}/planVersions/pro.ts`, "utf8");

/** Version numbers are creation order on the server, so history pushed after
 * the live row is numbered higher; the config's own statement wins. */
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
		previewUpdate: async () => preview,
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

test("a history row the server numbered later is rewritten where it is, never as a draft", async () => {
	const historyDir = freshWithHistory({
		name: "stays",
		rootPlans:
			'\t\tplan({ internalId: "prod_v2", planId: "pro", versionSlug: "v2", name: "Pro" }),',
		history:
			'\tplan({ internalId: "prod_v1", planId: "pro", versionSlug: "v1", name: "Pro" }),',
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
		cwd: historyDir,
		write: () => {},
	});
	expect(result.replaced).toEqual(["pro@v1"]);
	expect(result.appended).toEqual([]);
	expect(historyTextIn(historyDir)).toContain('name: "Pro (legacy)"');
	expect(historyTextIn(historyDir)).toContain('internalId: "prod_v1"');
	expect(rootTextIn(historyDir)).not.toContain("active: false");
	expect(rootTextIn(historyDir).match(/plan\(\{/g)?.length ?? 0).toBe(1);
});

test("an unstated older version is appended into the imported planVersions array", async () => {
	const historyDir = freshWithHistory({
		name: "unstated",
		rootPlans:
			'\t\tplan({ internalId: "prod_v2", planId: "pro", versionSlug: "v2", name: "Pro" }),',
		history: "",
	});
	const rows = {
		features: [],
		plans: [
			{ ...numberedLaterRows.plans[0], version: 2 },
			{ ...numberedLaterRows.plans[1], version: 1 },
		],
	};
	const result = await runPull({
		client: clientFor({
			preview: { features: [], plans: [liveV2Entry] },
			rows,
		}),
		cwd: historyDir,
		write: () => {},
	});
	expect(result.appended).toEqual(["pro@v1"]);
	expect(historyTextIn(historyDir)).toContain('internalId: "prod_v1"');
	expect(historyTextIn(historyDir)).not.toContain("active: false");
	expect(rootTextIn(historyDir).match(/plan\(\{/g)?.length ?? 0).toBe(1);
});

test("a row the server superseded moves from plans into history", async () => {
	const historyDir = freshWithHistory({
		name: "moves",
		rootPlans:
			'\t\tplan({ internalId: "prod_v1", planId: "pro", versionSlug: "v1", name: "Pro" }),',
		history: "",
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
				state: { hasCustomers: false },
			},
		],
	};
	const result = await runPull({
		client: clientFor({ preview, rows: numberedLaterRows }),
		cwd: historyDir,
		write: () => {},
	});
	expect(result.replaced).toEqual(["pro@v1"]);
	expect(historyTextIn(historyDir)).toContain('internalId: "prod_v1"');
	expect(rootTextIn(historyDir)).not.toContain('internalId: "prod_v1"');
	// The live row the config never stated arrives in plans.
	expect(result.appended).toEqual(["pro@v2"]);
	expect(rootTextIn(historyDir)).toContain('internalId: "prod_v2"');
});
