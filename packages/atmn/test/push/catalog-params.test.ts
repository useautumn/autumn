import { expect, test } from "bun:test";
import { buildCatalogUpdateParams } from "../../src/commands/push/push.js";

test("buildCatalogUpdateParams includes selected variant propagation ids", () => {
	const params = buildCatalogUpdateParams({
		features: [],
		plans: [{ id: "pro", name: "Pro" }],
		variantPropagationSelections: {
			pro: [
				{
					variant_plan_id: "pro_annual",
					customize: { price: { amount: 500, interval: "year" } },
				},
				{
					variant_plan_id: "pro_enterprise",
					customize: { price: { amount: 5000, interval: "year" } },
				},
			],
		},
	});

	expect(params.plans[0]).toMatchObject({
		plan_id: "pro",
		variants: [
			{
				variant_plan_id: "pro_annual",
				customize: { price: { amount: 500, interval: "year" } },
			},
			{
				variant_plan_id: "pro_enterprise",
				customize: { price: { amount: 5000, interval: "year" } },
			},
		],
	});
});

test("buildCatalogUpdateParams omits variants when no variants are selected", () => {
	const params = buildCatalogUpdateParams({
		features: [],
		plans: [{ id: "pro", name: "Pro" }],
	});

	expect(params.plans[0]).not.toHaveProperty("variants");
});
