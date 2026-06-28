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
		planMigrationSelections: {
			"pro@v1": true,
		},
		planUpdateIntentSelections: {
			"pro@v1": "update_current",
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

test("buildCatalogUpdateParams maps all-versions intent without migration", () => {
	const params = buildCatalogUpdateParams({
		features: [],
		plans: [{ id: "pro", name: "Pro" }],
		planUpdateIntentSelections: {
			pro: "update_all_versions",
		},
	});

	expect(params.plans[0]).toMatchObject({
		plan_id: "pro",
		all_versions: true,
	});
	expect(params.plans[0]).not.toHaveProperty("create_migration");
	expect(params.plans[0]).not.toHaveProperty("disable_version");
});

test("buildCatalogUpdateParams maps all-versions migration selection", () => {
	const params = buildCatalogUpdateParams({
		features: [],
		plans: [{ id: "pro", name: "Pro" }],
		planMigrationSelections: {
			pro: true,
		},
		planUpdateIntentSelections: {
			pro: "update_all_versions",
		},
	});

	expect(params.plans[0]).toMatchObject({
		plan_id: "pro",
		all_versions: true,
		create_migration: true,
	});
});

test("buildCatalogUpdateParams can include preview detail flags", () => {
	const params = buildCatalogUpdateParams({
		features: [],
		includePreviewDetails: true,
		plans: [{ id: "pro", name: "Pro" }],
	});

	expect(params.plans[0]).toMatchObject({
		plan_id: "pro",
		include_versions: true,
		include_variants: true,
	});
});
