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
import { buildMigrationDraft } from "@/views/products/plan/versioning/buildMigrationDraft";

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
