import { describe, expect, test } from "bun:test";
import {
	AppEnv,
	type Feature,
	FeatureType,
	FeatureUsageType,
	type FrontendProduct,
	ProductItemInterval,
	UpdateCatalogPlanParamsSchema,
} from "@autumn/shared";
import {
	buildCatalogUpdatePlans,
	buildUpdateCatalogPlanParams,
} from "@/views/products/plan/catalog/buildUpdateCatalogPlanParams";

const features: Feature[] = [
	{
		internal_id: "fe_messages",
		org_id: "org_1",
		created_at: 1,
		env: AppEnv.Sandbox,
		id: "messages",
		name: "Messages",
		type: FeatureType.Metered,
		config: { usage_type: FeatureUsageType.Single },
		display: null,
		archived: false,
		event_names: [],
	},
	{
		internal_id: "fe_admin",
		org_id: "org_1",
		created_at: 1,
		env: AppEnv.Sandbox,
		id: "admin",
		name: "Admin",
		type: FeatureType.Metered,
		config: { usage_type: FeatureUsageType.Continuous },
		display: null,
		archived: false,
		event_names: [],
	},
];

const baseProduct: FrontendProduct = {
	id: "pro",
	name: "Pro",
	description: "Old description",
	is_add_on: false,
	is_default: false,
	version: 3,
	group: "core",
	env: AppEnv.Sandbox,
	free_trial: {
		duration: "day",
		length: 14,
		card_required: false,
	},
	items: [
		{
			price: 10,
			interval: ProductItemInterval.Month,
			interval_count: 1,
		},
	],
	created_at: 1,
	archived: false,
	planType: "paid",
	basePriceType: "recurring",
};

const editedProduct: FrontendProduct = {
	...baseProduct,
	name: "Pro Plus",
	description: null,
	free_trial: null,
	items: [
		{
			price: 20,
			interval: ProductItemInterval.Month,
			interval_count: 1,
		},
		{
			feature_id: "messages",
			included_usage: 500,
			interval: ProductItemInterval.Month,
			interval_count: 1,
		},
		{
			feature_id: "admin",
			included_usage: 1,
		},
	],
};

describe("buildUpdateCatalogPlanParams", () => {
	test("in-place pins version and omits versioning", () => {
		const params = buildUpdateCatalogPlanParams({
			baseProduct,
			editedProduct,
			features,
		});
		const body = JSON.parse(JSON.stringify(params));

		expect(body).toMatchObject({
			plan_id: "pro",
			version: 3,
			name: "Pro Plus",
			description: null,
			group: "core",
			add_on: false,
			is_default: false,
			auto_enable: false,
			price: { amount: 20, interval: "month" },
			free_trial: null,
		});
		expect(body.versioning).toBeUndefined();
		expect(body.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ feature_id: "admin", included: 1 }),
				expect.objectContaining({
					feature_id: "messages",
					included: 500,
					reset: { interval: "month" },
				}),
			]),
		);
		expect(() => UpdateCatalogPlanParamsSchema.parse(body)).not.toThrow();
	});

	test("new_version and all_versions omit the version pin", () => {
		const minted = buildUpdateCatalogPlanParams({
			baseProduct,
			editedProduct,
			features,
			versioning: "new_version",
		});
		expect(minted.version).toBeUndefined();
		expect(minted.versioning).toBe("new_version");

		const all = buildUpdateCatalogPlanParams({
			baseProduct,
			editedProduct,
			features,
			versioning: "all_versions",
		});
		expect(all.version).toBeUndefined();
		expect(all.versioning).toBe("all_versions");
	});

	test("maps selected variants and license parents onto propagate", () => {
		const params = buildUpdateCatalogPlanParams({
			baseProduct,
			editedProduct,
			features,
			propagate: {
				variants: [{ plan_id: "pro_eu" }],
				license_parents: [{ plan_id: "team", version: 2 }],
			},
		});
		expect(params.propagate).toEqual({
			variants: [{ plan_id: "pro_eu" }],
			license_parents: [{ plan_id: "team", version: 2 }],
		});
	});

	test("licenses-only omits items, price, and free_trial", () => {
		const licenses = [{ license_plan_id: "developer-seat", included: 0 }];
		const params = buildUpdateCatalogPlanParams({
			baseProduct,
			editedProduct,
			features,
			licenses,
			includeContent: false,
		});
		expect(params.licenses).toEqual(licenses);
		expect(params.items).toBeUndefined();
		expect(params.price).toBeUndefined();
		expect(params.free_trial).toBeUndefined();
	});

	test("passes migration.draft through", () => {
		const params = buildUpdateCatalogPlanParams({
			baseProduct,
			editedProduct,
			features,
			migration: { draft: true, include_custom: true },
		});
		expect(params.migration).toEqual({
			draft: true,
			include_custom: true,
		});
	});

	test("a variant is updated as its own plan row, not as customize overlay on the base", () => {
		const params = buildUpdateCatalogPlanParams({
			baseProduct: { ...baseProduct, id: "pro_eu", version: 1 },
			editedProduct: {
				...editedProduct,
				id: "pro_eu",
				base_id: "pro",
			},
			features,
		});
		expect(params.plan_id).toBe("pro_eu");
		expect(params.variants).toBeUndefined();
		expect(params.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ feature_id: "messages", included: 500 }),
			]),
		);
	});

	test("strips stripe_price_id off price and items", () => {
		const params = buildUpdateCatalogPlanParams({
			baseProduct,
			editedProduct: {
				...editedProduct,
				items: [
					{
						price: 20,
						interval: ProductItemInterval.Month,
						interval_count: 1,
						stripe_price_id: "price_base_stale",
						price_config: { stripe_price_id: "price_base_stale" },
					},
					{
						feature_id: "messages",
						included_usage: 500,
						interval: ProductItemInterval.Month,
						interval_count: 1,
						stripe_price_id: "price_messages_stale",
						price_config: { stripe_price_id: "price_messages_stale" },
					},
				],
			},
			features,
		});
		const body = JSON.parse(JSON.stringify(params));

		expect(body.price?.stripe_price_id).toBeUndefined();
		for (const item of body.items ?? []) {
			expect(item.stripe_price_id).toBeUndefined();
			expect(item.price?.stripe_price_id).toBeUndefined();
		}
	});

	test("create omits version and versioning", () => {
		const params = buildUpdateCatalogPlanParams({
			editedProduct: { ...editedProduct, is_default: true },
			features,
		});
		expect(params.version).toBeUndefined();
		expect(params.versioning).toBeUndefined();
		expect(params.plan_id).toBe("pro");
		expect(params.is_default).toBe(true);
		expect(() =>
			UpdateCatalogPlanParamsSchema.parse(JSON.parse(JSON.stringify(params))),
		).not.toThrow();
	});
});

describe("buildCatalogUpdatePlans", () => {
	test("link-only nests the plan under the chosen base and omits the current row", () => {
		const plans = buildCatalogUpdatePlans({
			baseProduct,
			editedProduct: { ...baseProduct, base_id: "team" },
			features,
			persistedBasePlanId: null,
			includeContent: false,
		});
		expect(plans).toEqual([
			{ plan_id: "team", variants: [{ variant_plan_id: "pro" }] },
		]);
	});

	test("content + link sends the base nest first, then the current plan row", () => {
		const plans = buildCatalogUpdatePlans({
			baseProduct,
			editedProduct: { ...editedProduct, base_id: "team" },
			features,
			persistedBasePlanId: null,
			includeContent: true,
		});
		expect(plans[0]).toEqual({
			plan_id: "team",
			variants: [{ variant_plan_id: "pro" }],
		});
		expect(plans[1]).toMatchObject({
			plan_id: "pro",
			name: "Pro Plus",
		});
		expect(plans[1]?.base_variant_id).toBeUndefined();
		expect(plans).toHaveLength(2);
	});

	test("unlink-only is a direct intent with base_variant_id null", () => {
		const plans = buildCatalogUpdatePlans({
			baseProduct: { ...baseProduct, id: "pro_eu" },
			editedProduct: { ...baseProduct, id: "pro_eu", base_id: null },
			features,
			persistedBasePlanId: "pro",
			includeContent: false,
		});
		expect(plans).toEqual([{ plan_id: "pro_eu", base_variant_id: null }]);
	});

	test("content + unlink sends the current plan row with base_variant_id null", () => {
		const plans = buildCatalogUpdatePlans({
			baseProduct: { ...baseProduct, id: "pro_eu", version: 1 },
			editedProduct: { ...editedProduct, id: "pro_eu", base_id: null },
			features,
			persistedBasePlanId: "pro",
			includeContent: true,
		});
		expect(plans).toHaveLength(1);
		expect(plans[0]).toMatchObject({
			plan_id: "pro_eu",
			name: "Pro Plus",
			base_variant_id: null,
		});
	});

	test("an already-linked variant with no base edit is still one content row", () => {
		const plans = buildCatalogUpdatePlans({
			baseProduct: { ...baseProduct, id: "pro_eu", version: 1 },
			editedProduct: {
				...editedProduct,
				id: "pro_eu",
				base_id: "pro",
			},
			features,
			persistedBasePlanId: "pro",
		});
		expect(plans).toHaveLength(1);
		expect(plans[0]?.plan_id).toBe("pro_eu");
		expect(plans[0]?.variants).toBeUndefined();
		expect(plans[0]?.base_variant_id).toBeUndefined();
	});
});
