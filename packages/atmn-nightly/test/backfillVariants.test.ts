/** A variant written as `variant({...})` in its own file takes the stable id
 * the catalog reports for it; the plan's inline text is untouched. */

import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { backfillInternalIds } from "../src/actions/push/backfillInternalIds";

const dir = `${import.meta.dir}/.tmp/backfill-variants`;

test("a variant fixture in its own file gets its internalId, once", () => {
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(`${dir}/variants`, { recursive: true });
	writeFileSync(
		`${dir}/autumn.config.ts`,
		'import { plan } from "../../../src/generated/plans";\nimport { atmn } from "../../../src/generated/wire";\nimport { proAnnual } from "./variants/proAnnual";\n\nexport default atmn({\n\tplans: [plan({ planId: "pro", name: "Pro", variants: [proAnnual] })],\n});\n',
	);
	writeFileSync(
		`${dir}/variants/proAnnual.ts`,
		'import { variant } from "../../../../src/generated/variants";\n\nexport const proAnnual = variant({\n\tvariantPlanId: "pro_annual",\n\tname: "Pro (annual)",\n\tcustomize: { price: { amount: 490, interval: "year" } },\n});\n',
	);
	const rows = {
		plans: [
			{
				id: "pro",
				internalId: "prod_pro",
				variants: [
					{ variantPlanId: "pro_annual", plan: { internalId: "prod_annual" } },
				],
			},
		],
	};
	const first = backfillInternalIds({
		rows,
		configPath: `${dir}/autumn.config.ts`,
	});
	expect(first.backfilled).toEqual(["pro", "pro_annual"]);
	const variantFile = readFileSync(`${dir}/variants/proAnnual.ts`, "utf8");
	expect(variantFile).toContain(
		'variant({\n\tinternalId: "prod_annual",\n\tvariantPlanId: "pro_annual",',
	);
	expect(readFileSync(`${dir}/autumn.config.ts`, "utf8")).toContain(
		'internalId: "prod_pro"',
	);

	const second = backfillInternalIds({
		rows,
		configPath: `${dir}/autumn.config.ts`,
	});
	expect(second.backfilled).toEqual([]);
	expect(readFileSync(`${dir}/variants/proAnnual.ts`, "utf8")).toBe(
		variantFile,
	);
});

/** The shape a real config takes: items naming another fixture's id make the
 * literal "dynamic", and a variant may state its id in single quotes. */
test("a plan and its variant both take their id and slug from the catalog", () => {
	const nestedDir = `${import.meta.dir}/.tmp/backfill-variants-nested`;
	rmSync(nestedDir, { recursive: true, force: true });
	mkdirSync(nestedDir, { recursive: true });
	writeFileSync(
		`${nestedDir}/autumn.config.ts`,
		'import { atmn } from "../../../src/generated/wire";\nimport { pro } from "./pro";\n\nexport default atmn({ plans: [pro] });\n',
	);
	writeFileSync(
		`${nestedDir}/pro.ts`,
		[
			'import { plan } from "../../../src/generated/plans";',
			'import { variant } from "../../../src/generated/variants";',
			'import { credits } from "./features";',
			"",
			"export const proYearly = variant({",
			"\tvariantPlanId: 'pro_yearly',",
			"\tname: 'Pro Yearly',",
			"\tcustomize: {",
			'\t\tprice: { amount: 200, interval: "year" },',
			"\t\titems: [{ featureId: credits.featureId, included: 200 }],",
			"\t},",
			"});",
			"",
			"export const pro = plan({",
			'\tname: "Pro",',
			'\tplanId: "pro",',
			'\tprice: { amount: 20, interval: "month" },',
			"\tvariants: [proYearly],",
			"\titems: [{ featureId: credits.featureId, included: 100 }],",
			"});",
			"",
		].join("\n"),
	);

	// `catalogV2.get` nests the resolved variant plan under the edge.
	const rows = {
		plans: [
			{
				id: "pro",
				internalId: "prod_123",
				versionSlug: "v1",
				variants: [
					{
						variantPlanId: "pro_yearly",
						plan: { internalId: "prod_456", versionSlug: "v1" },
					},
				],
			},
		],
	};
	const { backfilled, slugged } = backfillInternalIds({
		rows,
		configPath: `${nestedDir}/autumn.config.ts`,
	});
	expect(backfilled).toEqual(["pro", "pro_yearly"]);
	expect(slugged).toEqual(["pro", "pro_yearly"]);

	const source = readFileSync(`${nestedDir}/pro.ts`, "utf8");
	expect(source).toContain('internalId: "prod_123"');
	expect(source).toContain('internalId: "prod_456"');
	expect(source).toContain("variantPlanId: 'pro_yearly'");
	expect(source.match(/versionSlug: "v1"/g)).toHaveLength(2);

	// Second run is a no-op: nothing is stated twice.
	const second = backfillInternalIds({
		rows,
		configPath: `${nestedDir}/autumn.config.ts`,
	});
	expect(second).toEqual({ backfilled: [], slugged: [] });
	expect(readFileSync(`${nestedDir}/pro.ts`, "utf8")).toBe(source);
});
