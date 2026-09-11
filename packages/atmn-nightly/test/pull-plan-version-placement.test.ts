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

test("a missing history fixture gets its own file and a root reference", async () => {
	rmSync(directory, { recursive: true, force: true });
	mkdirSync(join(directory, "planVersions"), { recursive: true });
	writeFileSync(join(directory, "planVersions", ".gitkeep"), "", "utf8");
	writeFileSync(
		configPath,
		[
			'import { atmn, plan } from "atmn-nightly";',
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
			'import { atmn, plan } from "atmn-nightly";',
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
			'import { plan } from "atmn-nightly";',
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
