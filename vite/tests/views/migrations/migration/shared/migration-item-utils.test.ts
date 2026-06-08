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
	type ProductItem,
} from "@autumn/shared";
import {
	migrationItemToProductItem,
	productItemToMigrationItem,
} from "@/views/migrations/migration/shared/migrationItemUtils";

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

describe("migrationItemUtils", () => {
	test("round-trips tiered usage prices", () => {
		const migrationItem = {
			feature_id: "credits",
			included: 0,
			price: {
				tiers: [
					{ to: 100, amount: 20 },
					{ to: "inf", amount: 40 },
				],
				tier_behavior: TierBehavior.Graduated,
				interval: ProductItemInterval.Month,
				billing_units: 1,
				billing_method: BillingMethod.UsageBased,
				max_purchase: null,
			},
		};

		const productItem = migrationItemToProductItem(migrationItem, features);

		expect(productItem.tiers).toEqual([
			{ to: 100, amount: 20 },
			{ to: "inf", amount: 40 },
		]);
		expect(productItem.tier_behavior).toBe(TierBehavior.Graduated);
		expect(productItem.usage_model).toBe(UsageModel.PayPerUse);

		const saved = productItemToMigrationItem(productItem);

		expect(saved).toMatchObject(migrationItem);
		expect(saved.price).not.toHaveProperty("amount");
	});

	test("adjusts tier bounds by included usage", () => {
		const productItem = migrationItemToProductItem(
			{
				feature_id: "credits",
				included: 10,
				price: {
					tiers: [
						{ to: 110, amount: 20 },
						{ to: "inf", amount: 40 },
					],
					tier_behavior: TierBehavior.Graduated,
					interval: ProductItemInterval.Month,
					billing_units: 1,
					billing_method: BillingMethod.UsageBased,
					max_purchase: 500,
				},
			},
			features,
		);

		expect(productItem.tiers).toEqual([
			{ to: 100, amount: 20 },
			{ to: "inf", amount: 40 },
		]);
		expect(productItem.usage_limit).toBe(510);

		const saved = productItemToMigrationItem(productItem);
		expect(saved.price).toMatchObject({
			tiers: [
				{ to: 110, amount: 20 },
				{ to: "inf", amount: 40 },
			],
			max_purchase: 500,
		});
	});

	test("keeps simple prices in amount form", () => {
		const migrationItem = productItemToMigrationItem({
			feature_id: "credits",
			included_usage: 0,
			interval: ProductItemInterval.Month,
			usage_model: UsageModel.PayPerUse,
			tiers: [{ to: "inf", amount: 25 }],
			billing_units: 1,
		} as ProductItem);

		expect(migrationItem.price).toMatchObject({
			amount: 25,
			interval: ProductItemInterval.Month,
			billing_method: BillingMethod.UsageBased,
		});
		expect(migrationItem.price).not.toHaveProperty("tiers");
	});
});
