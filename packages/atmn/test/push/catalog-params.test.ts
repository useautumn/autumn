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

test("buildCatalogUpdateParams pins historical plan versions in place", () => {
	const params = buildCatalogUpdateParams({
		features: [],
		plans: [
			{ id: "pro", name: "Pro v1", version: 1 },
			{ id: "pro", name: "Pro v2", version: 2 },
		],
	});

	expect(params.plans[0]).toMatchObject({
		plan_id: "pro",
		version: 1,
		disable_version: true,
	});
	expect(params.plans[1]).toMatchObject({
		plan_id: "pro",
		version: 2,
	});
	expect(params.plans[1]).not.toHaveProperty("disable_version");
});

test("buildCatalogUpdateParams accepts exact-version plan intents", () => {
	const params = buildCatalogUpdateParams({
		features: [],
		plans: [
			{ id: "pro", name: "Pro v1", version: 1 },
			{ id: "pro", name: "Pro v2", version: 2 },
		],
		planUpdateIntentSelections: {
			"pro@v1": "update_current_and_migrate",
		},
	});

	expect(params.plans[0]).toMatchObject({
		plan_id: "pro",
		version: 1,
		disable_version: true,
		create_migration: true,
	});
	expect(params.plans[1]).not.toHaveProperty("create_migration");
});
