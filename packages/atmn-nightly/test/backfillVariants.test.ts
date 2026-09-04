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
