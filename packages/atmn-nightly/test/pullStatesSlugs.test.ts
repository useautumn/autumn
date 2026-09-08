/**
 * A pull never leaves a fixture slug-less: a plan row and the variant entries
 * under it (inline objects and `variant({...})` calls alike) take the slug
 * the catalog reports, even when nothing else about them changed.
 */

import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runPull } from "../src/actions/pull";
import type { AutumnClient } from "../src/generated/client";

const dir = join(import.meta.dir, ".tmp", "pull-states-slugs");

const unchangedPreview = {
	features: [],
	plans: [
		{
			planId: "pro",
			internalId: "prod_pro",
			version: 1,
			versionSlug: "v1",
			active: true,
			action: "none",
			state: {},
		},
	],
};

const catalog = {
	features: [],
	plans: [
		{
			id: "pro",
			internalId: "prod_pro",
			name: "Pro",
			version: 1,
			versionSlug: "v1",
			active: true,
			archived: false,
			items: [],
			variants: [
				{
					variantPlanId: "pro_yearly",
					name: "Pro Yearly",
					plan: {
						id: "pro_yearly",
						internalId: "prod_yearly",
						version: 1,
						versionSlug: "v1",
						active: true,
					},
				},
				{
					variantPlanId: "pro_team",
					name: "Pro Team",
					plan: {
						id: "pro_team",
						internalId: "prod_team",
						version: 1,
						versionSlug: "v1",
						active: true,
					},
				},
			],
		},
	],
};

const client = {
	previewUpdate: async () => unchangedPreview,
	update: async () => ({}),
	get: async () => catalog,
} as unknown as AutumnClient;

test("a pull writes versionSlug into every plan row and variant entry that lacks one", async () => {
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(join(dir, "variants"), { recursive: true });
	writeFileSync(
		join(dir, "variants/proTeam.ts"),
		[
			'import { variant } from "../../../../src/generated/variants";',
			"",
			"export const proTeam = variant({",
			'\tvariantPlanId: "pro_team",',
			'\tname: "Pro Team",',
			"});",
			"",
		].join("\n"),
	);
	writeFileSync(
		join(dir, "autumn.config.ts"),
		[
			'import { plan } from "../../../src/generated/plans";',
			'import { atmn } from "../../../src/generated/wire";',
			'import { proTeam } from "./variants/proTeam";',
			"",
			"export default atmn({",
			"\tfeatures: [],",
			"\tplans: [",
			"\t\tplan({",
			'\t\t\tplanId: "pro",',
			'\t\t\tname: "Pro",',
			"\t\t\tvariants: [",
			'\t\t\t\t{ variantPlanId: "pro_yearly", name: "Pro Yearly" },',
			"\t\t\t\tproTeam,",
			"\t\t\t],",
			"\t\t}),",
			"\t],",
			"});",
			"",
		].join("\n"),
	);

	const printed: string[] = [];
	await runPull({ client, cwd: dir, write: (text) => printed.push(text) });

	const config = readFileSync(join(dir, "autumn.config.ts"), "utf8");
	expect(config).toContain(
		'\t\tplan({\n\t\t\tinternalId: "prod_pro",\n\t\t\tplanId: "pro",\n\t\t\tname: "Pro",',
	);
	expect(config).toContain(
		'{ internalId: "prod_yearly", variantPlanId: "pro_yearly", name: "Pro Yearly", versionSlug: "v1" }',
	);
	expect(config).toContain('\t\t\t],\n\t\t\tversionSlug: "v1",\n\t\t}),');
	expect(readFileSync(join(dir, "variants/proTeam.ts"), "utf8")).toBe(
		[
			'import { variant } from "../../../../src/generated/variants";',
			"",
			"export const proTeam = variant({",
			'\tinternalId: "prod_team",',
			'\tvariantPlanId: "pro_team",',
			'\tname: "Pro Team",',
			'\tversionSlug: "v1",',
			"});",
			"",
		].join("\n"),
	);
	expect(printed.join("")).toContain("↳ wrote internalId into 3 fixtures");
	expect(printed.join("")).toContain("↳ wrote versionSlug into 3 fixtures");
});
