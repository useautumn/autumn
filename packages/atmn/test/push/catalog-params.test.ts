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
		migration: { draft: true },
	});
	expect(params.plans[1]).not.toHaveProperty("migration");
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
	expect(params.plans[0]).not.toHaveProperty("migration");
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
		migration: { draft: true },
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

test("buildCatalogUpdateParams maps plan billing controls", () => {
	const params = buildCatalogUpdateParams({
		features: [],
		plans: [
			{
				id: "pro",
				name: "Pro",
				billingControls: {
					usage_limits: [
						{
							feature_id: "messages",
							enabled: true,
							limit: 1000,
							interval: "month",
						},
					],
				},
			},
		],
	});

	expect(params.plans[0]).toMatchObject({
		plan_id: "pro",
		billing_controls: {
			usage_limits: [
				{
					feature_id: "messages",
					enabled: true,
					limit: 1000,
					interval: "month",
				},
			],
		},
	});
});

test("buildCatalogUpdateParams maps direct variant update-current migration controls", () => {
	const params = buildCatalogUpdateParams({
		features: [],
		plans: [
			{
				id: "pro",
				name: "Pro",
				variants: [
					{
						id: "pro_annual",
						name: "Pro Annual",
						customize: { price: { amount: 200, interval: "year" } },
					},
				],
			},
		],
		variantMigrationSelections: {
			pro_annual: true,
		},
		variantUpdateIntentSelections: {
			pro_annual: "update_current",
		},
	});

	expect(params.plans[0]).toMatchObject({
		plan_id: "pro",
		variants: [
			{
				variant_plan_id: "pro_annual",
				disable_version: true,
				migration: { draft: true },
			},
		],
	});
});

test("buildCatalogUpdateParams maps direct variant create-version controls", () => {
	const params = buildCatalogUpdateParams({
		features: [],
		plans: [
			{
				id: "pro",
				name: "Pro",
				variants: [
					{
						id: "pro_annual",
						name: "Pro Annual",
						customize: { price: { amount: 200, interval: "year" } },
					},
				],
			},
		],
		variantMigrationSelections: {
			pro_annual: true,
		},
		variantUpdateIntentSelections: {
			pro_annual: "create_version",
		},
	});

	expect(params.plans[0]).toMatchObject({
		plan_id: "pro",
		variants: [
			{
				variant_plan_id: "pro_annual",
				force_version: true,
			},
		],
	});
	expect(
		(params.plans[0].variants as Record<string, unknown>[])[0],
	).not.toHaveProperty("migration");
});

test("buildCatalogUpdateParams filters skipped direct variants", () => {
	const params = buildCatalogUpdateParams({
		features: [],
		plans: [
			{
				id: "pro",
				name: "Pro",
				variants: [
					{
						id: "pro_annual",
						name: "Pro Annual",
						customize: { price: { amount: 200, interval: "year" } },
					},
				],
			},
		],
		skipPlanIds: ["pro_annual"],
		variantUpdateIntentSelections: {
			pro_annual: "update_current",
		},
	});

	expect(params.plans[0]).not.toHaveProperty("variants");
});
