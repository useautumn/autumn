import { expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { runPull } from "../src/actions/pull";
import { planVersionExportName } from "../src/actions/pull/appendPlanVersionFixture";
import { applyPreview } from "../src/actions/pull/applyPreview";
import type { AutumnClient } from "../src/generated/client";
import { COLLECTIONS } from "../src/generated/emit";

const directory = join(import.meta.dir, ".tmp", "pull-plan-version-placement");
const configPath = join(directory, "autumn.config.ts");

test("history export names are valid identifiers", () => {
	expect(
		planVersionExportName({ planId: "123-pro.plan", versionSlug: "v-1" }),
	).toBe("_123_pro_plan_v_1");
});

test("colliding sanitized names use a reversible fallback", () => {
	expect(
		planVersionExportName({
			planId: "pro",
			versionSlug: "summer_sale",
			takenSources: ["export const pro_summer_sale = {};"],
		}),
	).toBe("pro_5f_summer_5f_sale");
});

test("function and class declarations advance to the next free name", () => {
	expect(
		planVersionExportName({
			planId: "pro",
			versionSlug: "v1",
			takenSources: ["function pro_v1() {}\nclass pro_5f_v1 {}"],
		}),
	).toBe("pro_5f_v1_2");
});

test("shorthand destructuring reserves its bound name", () => {
	expect(
		planVersionExportName({
			planId: "pro",
			versionSlug: "v1",
			takenSources: ["const { pro_v1 } = value;"],
		}),
	).toBe("pro_5f_v1");
});

test("history membership beats a declaration beside the plans binding", () => {
	const root = "/catalog/autumn.config.ts";
	const plans = "/catalog/plans.ts";
	const history = "/catalog/history.ts";
	const files = new Map([
		[
			root,
			'import { activePlans } from "./plans";\nimport { historyPlans } from "./history";\nexport default atmn({ plans: activePlans, planVersions: historyPlans });\n',
		],
		[
			plans,
			'export const activeV2 = plan({ planId: "pro", internalId: "prod_v2", versionSlug: "v2" });\nexport const pro_v1 = plan({ planId: "pro", internalId: "prod_v1", versionSlug: "v1" });\nexport const activePlans = [activeV2];\n',
		],
		[
			history,
			'import { pro_v1 } from "./plans";\nexport const historyPlans = [pro_v1];\n',
		],
	]);

	applyPreview({
		collection: "plans",
		spec: COLLECTIONS.plans,
		entries: [
			{
				planId: "pro",
				versionSlug: "v1",
				internalId: "prod_v1",
				action: "create",
			},
		],
		catalogRows: [],
		statedRows: [
			{
				plan_id: "pro",
				version_slug: "v1",
				internal_id: "prod_v1",
				active: false,
			},
		],
		configPath: root,
		files,
		includeMappings: false,
	});

	expect(files.get(plans)).toContain("export const activePlans = [activeV2]");
	expect(files.get(plans)).not.toContain("export const pro_v1");
	expect(files.get(history)).toBe("export const historyPlans = [];\n");
});

test("draft membership cleans plans even though the draft is inactive", () => {
	const root = "/catalog/autumn.config.ts";
	const draft = "/catalog/draft.ts";
	const history = "/catalog/history.ts";
	const historySource = "export const historyPlans = [];\n";
	const files = new Map([
		[
			root,
			'import { pro_v3 } from "./draft";\nimport { historyPlans } from "./history";\nexport default atmn({ plans: [plan({ planId: "pro", versionSlug: "v2" }), pro_v3], planVersions: historyPlans });\n',
		],
		[
			draft,
			'export const pro_v3 = plan({ planId: "pro", internalId: "prod_v3", versionSlug: "v3", active: false });\n',
		],
		[history, historySource],
	]);

	applyPreview({
		collection: "plans",
		spec: COLLECTIONS.plans,
		entries: [
			{
				planId: "pro",
				versionSlug: "v3",
				internalId: "prod_v3",
				active: false,
				action: "create",
			},
		],
		catalogRows: [],
		statedRows: [
			{
				plan_id: "pro",
				version_slug: "v3",
				internal_id: "prod_v3",
				active: false,
			},
		],
		configPath: root,
		files,
		includeMappings: false,
	});

	expect(files.get(root)).not.toContain("pro_v3");
	expect(files.get(root)).toContain('versionSlug: "v2"');
	expect(files.get(history)).toBe(historySource);
});

test("a missing history fixture gets its own file and a root reference", async () => {
	rmSync(directory, { recursive: true, force: true });
	mkdirSync(join(directory, "planVersions"), { recursive: true });
	writeFileSync(join(directory, "planVersions", ".gitkeep"), "", "utf8");
	writeFileSync(
		configPath,
		[
			'import { plan } from "../../../src/generated/plans";',
			'import { atmn } from "../../../src/generated/wire";',
			"",
			"export default atmn({",
			"\tplans: [],",
			"\tplanVersions: [],",
			"});",
			"",
		].join("\n"),
		"utf8",
	);
	const client = {
		previewUpdateOrganization: async () => ({ config: { changes: [] } }),
		previewUpdate: async () => ({
			features: [],
			plans: [
				{
					planId: "pro",
					versionSlug: "v1",
					action: "delete",
					internalId: "prod_v1",
				},
			],
		}),
		update: async () => ({}),
		get: async () => ({
			features: [],
			plans: [
				{
					id: "pro",
					internalId: "prod_v1",
					name: "Pro",
					version: 1,
					versionSlug: "v1",
					active: false,
					archived: false,
					items: [],
				},
			],
		}),
	} as unknown as AutumnClient;

	const result = await runPull({ client, cwd: directory, write: () => {} });

	expect(result.appended).toEqual(["pro@v1"]);
	expect(readFileSync(configPath, "utf8")).toBe(
		[
			'import { pro_v1 } from "./planVersions/pro";',
			'import { plan } from "../../../src/generated/plans";',
			'import { atmn } from "../../../src/generated/wire";',
			"",
			"export default atmn({",
			"\tplans: [],",
			"\tplanVersions: [",
			"\t\tpro_v1,",
			"\t],",
			"});",
			"",
		].join("\n"),
	);
	expect(readFileSync(join(directory, "planVersions", "pro.ts"), "utf8")).toBe(
		[
			'import { plan } from "../../../../src/generated/plans";',
			"",
			"export const pro_v1 = plan({",
			'\tplanId: "pro",',
			'\tinternalId: "prod_v1",',
			'\tname: "Pro",',
			"\titems: [],",
			'\tversionSlug: "v1",',
			"});",
			"",
		].join("\n"),
	);
	expect(existsSync(join(directory, "planVersions", ".gitkeep"))).toBe(false);
});

test("deleting an exported history fixture cleans its imported array target", async () => {
	const targetDirectory = join(
		import.meta.dir,
		".tmp",
		"pull-plan-version-imported-target",
	);
	rmSync(targetDirectory, { recursive: true, force: true });
	mkdirSync(join(targetDirectory, "planVersions"), { recursive: true });
	writeFileSync(
		join(targetDirectory, "autumn.config.ts"),
		[
			'import { atmn } from "atmn-nightly";',
			'import { activePlans } from "./plans";',
			'import { proVersions } from "./planVersions/pro";',
			"",
			"export default atmn({",
			"\tplans: activePlans,",
			"\tplanVersions: proVersions,",
			"});",
			"",
		].join("\n"),
		"utf8",
	);
	const activePlansPath = join(targetDirectory, "plans.ts");
	const activePlansSource = [
		'import { plan } from "atmn-nightly";',
		"",
		"export const pro_v1 = plan({",
		'\tplanId: "pro",',
		'\tinternalId: "prod_v2",',
		'\tversionSlug: "v2",',
		'\tname: "Pro",',
		"});",
		"",
		"export const activePlans = [pro_v1];",
		"",
	].join("\n");
	writeFileSync(activePlansPath, activePlansSource, "utf8");
	const versionsPath = join(targetDirectory, "planVersions", "pro.ts");
	writeFileSync(
		versionsPath,
		[
			'import { plan } from "atmn-nightly";',
			"",
			"export const proVersions = [];",
			"",
		].join("\n"),
		"utf8",
	);
	const catalog = {
		features: [],
		plans: [
			{
				id: "pro",
				internalId: "prod_v1",
				name: "Pro",
				version: 1,
				versionSlug: "v1",
				active: false,
				archived: false,
				items: [],
			},
			{
				id: "pro",
				internalId: "prod_v2",
				name: "Pro",
				version: 2,
				versionSlug: "v2",
				active: true,
				archived: false,
				items: [],
			},
		],
	};
	const clientFor = ({ action }: { action: "create" | "delete" }) =>
		({
			previewUpdateOrganization: async () => ({ config: { changes: [] } }),
			previewUpdate: async () => ({
				features: [],
				plans: [
					{
						planId: "pro",
						versionSlug: "v1",
						action,
						internalId: "prod_v1",
					},
					{
						planId: "pro",
						versionSlug: "v2",
						action: "none",
						internalId: "prod_v2",
					},
				],
			}),
			update: async () => ({}),
			get: async () => catalog,
		}) as unknown as AutumnClient;

	await runPull({
		client: clientFor({ action: "delete" }),
		cwd: targetDirectory,
		write: () => {},
	});
	expect(readFileSync(versionsPath, "utf8")).toContain(
		"export const pro_v1 = plan({",
	);
	expect(readFileSync(versionsPath, "utf8")).toContain(
		"export const proVersions = [\n\tpro_v1,\n];",
	);

	await runPull({
		client: clientFor({ action: "create" }),
		cwd: targetDirectory,
		write: () => {},
	});
	const afterDelete = readFileSync(versionsPath, "utf8");
	expect(afterDelete).not.toContain("pro_v1");
	expect(afterDelete).toContain("export const proVersions = [];");
	expect(readFileSync(activePlansPath, "utf8")).toBe(activePlansSource);
});
