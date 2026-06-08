import { describe, expect, test } from "bun:test";
import {
	AppEnv,
	BillingMethod,
	FeatureType,
	FeatureUsageType,
	ProductItemInterval,
	TierBehavior,
	UsageModel,
	type Feature,
	type FrontendProduct,
} from "@autumn/shared";
import {
	buildMigrationDraft,
	buildVersionMigrationDraft,
} from "@/views/products/plan/versioning/buildMigrationDraft";

const features: Feature[] = [
	{
		internal_id: "fe_credits",
		org_id: "org_1",
		created_at: 1,
		env: AppEnv.Sandbox,
		id: "credits",
		name: "Credits",
		type: FeatureType.Metered,
		config: { usage_type: FeatureUsageType.Single },
		display: null,
		archived: false,
		event_names: [],
	},
];

const baseProduct: FrontendProduct = {
	id: "pro",
	name: "Pro",
	description: null,
	is_add_on: false,
	is_default: false,
	version: 2,
	group: null,
	env: AppEnv.Sandbox,
	free_trial: null,
	items: [],
	created_at: 1,
	archived: false,
	planType: "free",
	basePriceType: "free",
};

describe("buildMigrationDraft", () => {
	test("excludes custom plans by default", () => {
		const draft = buildMigrationDraft({
			baseProduct,
			editedProduct: { ...baseProduct, name: "Pro updated" },
			features,
			scope: "this_version",
		});

		expect(draft.filter.customer?.plan).toMatchObject({
			plan_id: "pro",
			version: 2,
			custom: false,
		});
		expect(draft.operations.customer?.[0]?.plan_filter).toMatchObject({
			plan_id: "pro",
			version: 2,
			custom: false,
		});
	});

	test("includes custom plans when enabled", () => {
		const draft = buildMigrationDraft({
			baseProduct,
			editedProduct: { ...baseProduct, name: "Pro updated" },
			features,
			scope: "this_version",
			includeCustom: true,
		});

		expect(draft.filter.customer?.plan).toEqual({
			plan_id: "pro",
			version: 2,
		});
		expect(draft.operations.customer?.[0]?.plan_filter).toEqual({
			plan_id: "pro",
			version: 2,
		});
	});

	test("preserves tiered add-item prices", () => {
		const draft = buildMigrationDraft({
			baseProduct,
			editedProduct: {
				...baseProduct,
				items: [
					{
						feature_id: "credits",
						included_usage: 0,
						interval: ProductItemInterval.Month,
						interval_count: 1,
						usage_model: UsageModel.PayPerUse,
						tiers: [
							{ to: 100, amount: 20 },
							{ to: "inf", amount: 40 },
						],
						billing_units: 1,
						tier_behavior: TierBehavior.Graduated,
					},
				],
			},
			features,
			scope: "this_version",
		});

		const updatePlan = draft.operations.customer?.[0];
		const addItem = updatePlan?.customize?.add_items?.[0];
		const price = JSON.parse(JSON.stringify(addItem?.price));

		expect(price).toMatchObject({
			tiers: [
				{ to: 100, amount: 20 },
				{ to: "inf", amount: 40 },
			],
			tier_behavior: TierBehavior.Graduated,
			billing_method: BillingMethod.UsageBased,
		});
		expect(price).not.toHaveProperty("amount");
	});
});

describe("buildVersionMigrationDraft", () => {
	test("excludes custom plans by default", () => {
		const draft = buildVersionMigrationDraft({
			productId: "pro",
			latestVersion: 3,
			scope: "all",
			pastVersions: [1, 2],
		});

		expect(draft.filter.customer?.plan).toMatchObject({
			plan_id: "pro",
			version: { $in: [1, 2] },
			custom: false,
		});
		expect(draft.operations.customer?.[0]?.plan_filter).toMatchObject({
			plan_id: "pro",
			version: { $in: [1, 2] },
			custom: false,
		});
	});

	test("omits custom filters when custom plans are included", () => {
		const draft = buildVersionMigrationDraft({
			productId: "pro",
			latestVersion: 3,
			scope: 2,
			pastVersions: [1, 2],
			includeCustom: true,
		});

		expect(draft.filter.customer?.plan).toEqual({
			plan_id: "pro",
			version: 2,
		});
		expect(draft.operations.customer?.[0]?.plan_filter).toEqual({
			plan_id: "pro",
			version: 2,
		});
	});
});
