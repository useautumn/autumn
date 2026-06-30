import { describe, expect, test } from "bun:test";
import type { Feature } from "../../src/compose/models/index.js";
import type { Plan } from "../../src/compose/models/variantModels.js";
import type { ApiPlan } from "../../src/lib/api/types/index.js";
import { transformApiPlans } from "../../src/lib/transforms/apiToSdk/index.js";
import { buildConfigFile } from "../../src/lib/transforms/sdkToCode/configFile.js";

const baseApiPlan = (overrides: Partial<ApiPlan>): ApiPlan =>
	({
		id: "pro",
		name: "Pro",
		description: null,
		group: null,
		version: 1,
		add_on: false,
		auto_enable: false,
		price: null,
		items: [],
		created_at: 0,
		env: "sandbox",
		archived: false,
		base_variant_id: null,
		config: { ignore_past_due: false },
		billing_controls: {},
		metadata: {},
		...overrides,
	}) as ApiPlan;

describe("variant config generation", () => {
	test("transformApiPlans nests variants under their base plan", () => {
		const plans = transformApiPlans([
			baseApiPlan({
				id: "pro",
				name: "Pro",
				items: [
					{
						feature_id: "messages",
						included: 500,
						reset: { interval: "month" },
					},
				],
			}),
			baseApiPlan({
				id: "pro_annual",
				name: "Pro Annual",
				variant_details: {
					base_plan_id: "pro",
					customize: {
						price: { amount: 500, interval: "year" },
						remove_items: [{ feature_id: "messages", interval: "month" }],
						add_items: [
							{
								feature_id: "messages",
								included: 1000,
								reset: { interval: "year" },
							},
						],
					},
				},
			}),
		]);

		expect(plans).toHaveLength(1);
		expect(plans[0]?.variants).toEqual([
			{
				id: "pro_annual",
				name: "Pro Annual",
				customize: {
					price: { amount: 500, interval: "year" },
					removeItems: [{ featureId: "messages", interval: "month" }],
					addItems: [
						{
							featureId: "messages",
							included: 1000,
							reset: { interval: "year" },
						},
					],
				},
			},
		]);
	});

	test("buildConfigFile emits method-style variant composers with feature references", () => {
		const features: Feature[] = [
			{
				id: "messages",
				name: "Messages",
				type: "metered",
				consumable: true,
			},
		];
		const plans: Plan[] = [
			{
				id: "pro",
				name: "Pro",
				items: [],
				variants: [
					{
						id: "pro_annual",
						name: "Pro Annual",
						customize: {
							removeItems: [{ featureId: "messages", interval: "month" }],
							addItems: [
								{
									featureId: "messages",
									included: 1000,
									reset: { interval: "year" },
								},
							],
						},
					},
				],
			},
		];

		const code = buildConfigFile(features, plans);

		expect(code).toContain("import { feature, item, plan } from 'atmn';");
		expect(code).not.toContain("variants: [");
		expect(code).toContain("export const proAnnual = pro.variant({");
		expect(code).toContain("removeItems: [");
		expect(code).not.toContain("itemFilter(");
		expect(code).toContain("featureId: messages.id");
	});

	test("all-version codegen suffixes exports and attaches variants to latest base", () => {
		const plans = transformApiPlans(
			[
				baseApiPlan({ id: "pro", name: "Pro", version: 1 }),
				baseApiPlan({ id: "pro", name: "Pro", version: 2 }),
				baseApiPlan({
					id: "pro_annual",
					name: "Pro Annual",
					version: 1,
					variant_details: {
						base_plan_id: "pro",
						customize: {
							price: { amount: 500, interval: "year" },
						},
					},
				}),
				baseApiPlan({
					id: "pro_annual",
					name: "Pro Annual",
					version: 2,
					variant_details: {
						base_plan_id: "pro",
						customize: {
							price: { amount: 550, interval: "year" },
						},
					},
				}),
			],
			{ allVersions: true },
		);

		expect(plans).toHaveLength(2);
		expect(plans[0]?.version).toBe(1);
		expect(plans[0]?.variants).toBeUndefined();
		expect(plans[1]?.version).toBe(2);
		expect(plans[1]?.variants?.map((variant) => variant.version)).toEqual([
			1, 2,
		]);

		const code = buildConfigFile([], plans);

		expect(code).toContain("export const proV1 = plan({");
		expect(code).toContain("version: 1,");
		expect(code).toContain("export const proV2 = plan({");
		expect(code).toContain("export const proAnnualV1 = proV2.variant({");
		expect(code).toContain("export const proAnnualV2 = proV2.variant({");
		expect(code).not.toContain("proV1.variant({");
	});

	test("buildConfigFile emits boolean items without included: 0", () => {
		const features: Feature[] = [
			{
				id: "engagement_tracking",
				name: "Engagement Tracking",
				type: "boolean",
			},
		];
		const plans: Plan[] = [
			{
				id: "pro",
				name: "Pro",
				items: [{ featureId: "engagement_tracking", included: 0 }],
			},
		];

		const code = buildConfigFile(features, plans);

		expect(code).toContain("export const engagementTracking = feature(");
		expect(code).toContain("item({ featureId: engagementTracking.id }),");
		expect(code).not.toContain("included: 0");
	});

	test("transformApiPlans maps variant customize billing controls to camelCase", () => {
		const plans = transformApiPlans([
			baseApiPlan({ id: "pro", name: "Pro" }),
			baseApiPlan({
				id: "pro_enterprise",
				name: "Pro Enterprise",
				variant_details: {
					base_plan_id: "pro",
					customize: {
						billing_controls: {
							spend_limits: [
								{
									feature_id: "messages",
									enabled: true,
									overage_limit: 100,
								},
							],
						},
					},
				},
			}),
		]);

		expect(plans[0]?.variants?.[0]?.customize?.billingControls).toEqual({
			spendLimits: [
				{
					featureId: "messages",
					enabled: true,
					overageLimit: 100,
				},
			],
		});
	});

	test("buildConfigFile emits plan-level billing controls", () => {
		const plans: Plan[] = [
			{
				id: "pro",
				name: "Pro",
				items: [],
				billingControls: {
					spendLimits: [
						{
							featureId: "messages",
							enabled: true,
							overageLimit: 25,
						},
					],
				},
			},
		];

		const code = buildConfigFile([], plans);

		expect(code).toContain("billingControls:");
		expect(code).toContain("spendLimits:");
		expect(code).toContain("overageLimit: 25");
	});
});
