/** An inline variant object under its base plan's `variants` takes its stable
 * id and slug just like a `variant({...})` fixture; the rest of the plan's
 * text keeps its bytes. */

import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { backfillInternalIds } from "../src/actions/push/backfillInternalIds";

const dir = `${import.meta.dir}/.tmp/backfill-inline-variants`;

const PRO_SOURCE = [
	'import { plan } from "../../../src/generated/plans";',
	"",
	"export const pro = plan({",
	'\tplanId: "pro",',
	'\tname: "Pro",',
	'\tprice: { amount: 20, interval: "month" },',
	"\tvariants: [",
	"\t\t{",
	'\t\t\tvariantPlanId: "proYearly",',
	'\t\t\tname: "Pro Yearly",',
	"\t\t\tcustomize: {",
	'\t\t\t\tprice: { amount: 200, interval: "year" },',
	"\t\t\t},",
	"\t\t},",
	"\t],",
	"});",
	"",
].join("\n");

const setup = (): string => {
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		`${dir}/autumn.config.ts`,
		'import { atmn } from "../../../src/generated/wire";\nimport { pro } from "./pro";\n\nexport default atmn({ plans: [pro] });\n',
	);
	writeFileSync(`${dir}/pro.ts`, PRO_SOURCE);
	return `${dir}/autumn.config.ts`;
};

const rows = {
	plans: [
		{
			id: "pro",
			internalId: "prod_pro",
			versionSlug: "v1",
			variants: [
				{
					variantPlanId: "proYearly",
					plan: { internalId: "prod_yearly", versionSlug: "v1" },
				},
			],
		},
	],
};

test("an inline variant object takes internalId first and versionSlug, once", () => {
	const configPath = setup();

	const first = backfillInternalIds({ rows, configPath });
	expect(first.backfilled).toEqual(["pro", "proYearly"]);
	expect(first.slugged).toEqual(["pro", "proYearly"]);

	const source = readFileSync(`${dir}/pro.ts`, "utf8");
	expect(source).toBe(
		[
			'import { plan } from "../../../src/generated/plans";',
			"",
			"export const pro = plan({",
			'\tinternalId: "prod_pro",',
			'\tplanId: "pro",',
			'\tname: "Pro",',
			'\tprice: { amount: 20, interval: "month" },',
			"\tvariants: [",
			"\t\t{",
			'\t\t\tinternalId: "prod_yearly",',
			'\t\t\tvariantPlanId: "proYearly",',
			'\t\t\tname: "Pro Yearly",',
			"\t\t\tcustomize: {",
			'\t\t\t\tprice: { amount: 200, interval: "year" },',
			"\t\t\t},",
			'\t\t\tversionSlug: "v1",',
			"\t\t},",
			"\t],",
			'\tversionSlug: "v1",',
			"});",
			"",
		].join("\n"),
	);

	const second = backfillInternalIds({ rows, configPath });
	expect(second).toEqual({ backfilled: [], slugged: [] });
	expect(readFileSync(`${dir}/pro.ts`, "utf8")).toBe(source);
});

test("a stated slug picks the matching inline entry when two versions share the id", () => {
	const configPath = setup();
	writeFileSync(
		`${dir}/pro.ts`,
		[
			'import { plan } from "../../../src/generated/plans";',
			"",
			"export const proV2 = plan({",
			'\tplanId: "pro",',
			'\tversionSlug: "v2",',
			'\tname: "Pro",',
			"\tvariants: [",
			'\t\t{ variantPlanId: "proYearly", name: "Pro Yearly", versionSlug: "v2" },',
			"\t],",
			"});",
			"",
			"export const proV1 = plan({",
			'\tplanId: "pro",',
			'\tversionSlug: "v1",',
			'\tname: "Pro",',
			"\tvariants: [",
			'\t\t{ variantPlanId: "proYearly", name: "Pro Yearly", versionSlug: "v1" },',
			"\t],",
			"});",
			"",
		].join("\n"),
	);
	writeFileSync(
		`${dir}/autumn.config.ts`,
		'import { atmn } from "../../../src/generated/wire";\nimport { proV1, proV2 } from "./pro";\n\nexport default atmn({ plans: [proV2], planVersions: [proV1] });\n',
	);

	const twoVersions = {
		plans: [
			{
				id: "pro",
				internalId: "prod_pro_v2",
				versionSlug: "v2",
				variants: [
					{
						variantPlanId: "proYearly",
						plan: { internalId: "prod_yearly_v2", versionSlug: "v2" },
					},
				],
			},
			{
				id: "pro",
				internalId: "prod_pro_v1",
				versionSlug: "v1",
				variants: [
					{
						variantPlanId: "proYearly",
						plan: { internalId: "prod_yearly_v1", versionSlug: "v1" },
					},
				],
			},
		],
	};
	const { backfilled } = backfillInternalIds({ rows: twoVersions, configPath });
	expect(backfilled).toEqual(["pro", "pro", "proYearly", "proYearly"]);

	const source = readFileSync(`${dir}/pro.ts`, "utf8");
	expect(source).toContain(
		'{ internalId: "prod_yearly_v2", variantPlanId: "proYearly", name: "Pro Yearly", versionSlug: "v2" }',
	);
	expect(source).toContain(
		'{ internalId: "prod_yearly_v1", variantPlanId: "proYearly", name: "Pro Yearly", versionSlug: "v1" }',
	);
});

test("two base versions each holding a slug-less inline entry take their own ids", () => {
	const configPath = setup();
	writeFileSync(
		`${dir}/pro.ts`,
		[
			'import { plan } from "../../../src/generated/plans";',
			"",
			"export const proV2 = plan({",
			'\tplanId: "pro",',
			'\tversionSlug: "v2",',
			'\tname: "Pro",',
			"\tvariants: [",
			'\t\t{ variantPlanId: "proYearly", name: "Pro Yearly" },',
			"\t],",
			"});",
			"",
			"export const proV1 = plan({",
			'\tplanId: "pro",',
			'\tversionSlug: "v1",',
			'\tname: "Pro",',
			"\tvariants: [",
			'\t\t{ variantPlanId: "proYearly", name: "Pro Yearly" },',
			"\t],",
			"});",
			"",
		].join("\n"),
	);
	writeFileSync(
		`${dir}/autumn.config.ts`,
		'import { atmn } from "../../../src/generated/wire";\nimport { proV1, proV2 } from "./pro";\n\nexport default atmn({ plans: [proV2], planVersions: [proV1] });\n',
	);

	const twoVersions = {
		plans: [
			{
				id: "pro",
				internalId: "prod_pro_v1",
				versionSlug: "v1",
				variants: [
					{
						variantPlanId: "proYearly",
						plan: { internalId: "prod_yearly_v1", versionSlug: "v1" },
					},
				],
			},
			{
				id: "pro",
				internalId: "prod_pro_v2",
				versionSlug: "v2",
				variants: [
					{
						variantPlanId: "proYearly",
						plan: { internalId: "prod_yearly_v2", versionSlug: "v2" },
					},
				],
			},
		],
	};
	const result = backfillInternalIds({ rows: twoVersions, configPath });
	expect(result.backfilled).toEqual(["pro", "pro", "proYearly", "proYearly"]);
	expect(result.slugged).toEqual(["proYearly", "proYearly"]);

	const source = readFileSync(`${dir}/pro.ts`, "utf8");
	expect(source).toContain(
		'export const proV2 = plan({\n\tinternalId: "prod_pro_v2",\n\tplanId: "pro",\n\tversionSlug: "v2",\n\tname: "Pro",\n\tvariants: [\n\t\t{ internalId: "prod_yearly_v2", variantPlanId: "proYearly", name: "Pro Yearly", versionSlug: "v2" },',
	);
	expect(source).toContain(
		'export const proV1 = plan({\n\tinternalId: "prod_pro_v1",\n\tplanId: "pro",\n\tversionSlug: "v1",\n\tname: "Pro",\n\tvariants: [\n\t\t{ internalId: "prod_yearly_v1", variantPlanId: "proYearly", name: "Pro Yearly", versionSlug: "v1" },',
	);
	expect(backfillInternalIds({ rows: twoVersions, configPath })).toEqual({
		backfilled: [],
		slugged: [],
	});
});
