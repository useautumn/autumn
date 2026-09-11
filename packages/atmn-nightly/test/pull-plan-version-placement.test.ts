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
import type { AutumnClient } from "../src/generated/client";

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
