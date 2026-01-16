import { describe, expect, test } from "bun:test";
import {
	type ApiPlan,
	type ApiProduct,
	ApiVersion,
	BillingInterval,
	type CreatePlanParams,
	FreeTrialDuration,
	OnDecrease,
	OnIncrease,
	ProductItemInterval,
	ResetInterval,
	RolloverExpiryDurationType,
	TierInfinite,
	UsageModel,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

describe(chalk.yellowBright("Plan V2 - Complex Real-World Scenarios"), () => {
	const autumnV2 = new AutumnInt({ version: ApiVersion.V2_0 });
	const autumnV1_2 = new AutumnInt({ version: ApiVersion.V1_2 });

	test("Full SaaS plan with multiple feature types", async () => {
		const productId = "saas_complete";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		await autumnV2.products.create({
			id: "saas_complete",
			name: "SaaS Complete",
			description: "Full-featured SaaS plan",
			price: { amount: 9900, interval: BillingInterval.Month },
			features: [
				// Boolean feature
				{ feature_id: TestFeature.Dashboard },
				// Metered with rollover
				{
					feature_id: TestFeature.Messages,
					granted_balance: 10000,
					reset: {
						interval: ResetInterval.Month,
					},
					rollover: {
						max: 20000,
						expiry_duration_type: RolloverExpiryDurationType.Month,
						expiry_duration_length: 1,
					},
				},
				// Continuous with proration
				{
					feature_id: TestFeature.Users,
					granted_balance: 10,
					reset: {
						interval: ResetInterval.Month,
					},
					proration: {
						on_increase: OnIncrease.ProrateImmediately,
						on_decrease: OnDecrease.Prorate,
					},
				},
			],
			free_trial: {
				duration_type: FreeTrialDuration.Day,
				duration_length: 14,
				card_required: false,
			},
		} as CreatePlanParams);

		const v2 = (await autumnV2.products.get("saas_complete")) as ApiPlan;
		expect(v2.features).toHaveLength(3);
		expect(v2.free_trial).toBeDefined();
		expect(v2.description).toBe("Full-featured SaaS plan");

		const v1_2 = (await autumnV1_2.products.get("saas_complete")) as ApiProduct;
		expect(v1_2.items).toHaveLength(4); // 1 base price + 3 features
		expect(v1_2.free_trial).toBeDefined();
	});

	test("Usage-only product (no base price)", async () => {
		const productId = "usage_only";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		await autumnV2.products.create({
			id: "usage_only",
			name: "Usage Only",
			features: [
				{
					feature_id: TestFeature.Messages,
					price: {
						interval: BillingInterval.Month,
						usage_model: UsageModel.PayPerUse,
						billing_units: 1,
						tiers: [
							{ to: 1000, amount: 5 },
							{ to: TierInfinite, amount: 2 },
						],
					},
				},
			],
		} as CreatePlanParams);

		const v2 = (await autumnV2.products.get("usage_only")) as ApiPlan;
		expect(v2.price).toBeNull();

		const v1_2 = (await autumnV1_2.products.get("usage_only")) as ApiProduct;
		expect(v1_2.items).toHaveLength(1);
	});

	test("Metered feature with rollover", async () => {
		const productId = "with_rollover";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		await autumnV2.products.create({
			id: "with_rollover",
			name: "With Rollover",
			features: [
				{
					feature_id: TestFeature.Messages,
					granted_balance: 1000,
					reset: {
						interval: ResetInterval.Month,
					},
					rollover: {
						max: 2000,
						expiry_duration_type: RolloverExpiryDurationType.Month,
						expiry_duration_length: 1,
					},
				},
			],
		} as CreatePlanParams);

		const v1_2 = (await autumnV1_2.products.get("with_rollover")) as ApiProduct;
		const item = v1_2.items[0];
		expect(item.config).toBeDefined();
		expect(item.config!.rollover).toBeDefined();
		expect(item.config!.rollover!.max).toBe(2000);
		expect(item.config!.rollover!.duration).toBe(
			RolloverExpiryDurationType.Month,
		);
		expect(item.config!.rollover!.length).toBe(1);
	});

	test("Multiple reset intervals (hour, day, week, quarter, year)", async () => {
		const intervals = [
			{ reset: ResetInterval.Hour, expected: ProductItemInterval.Hour },
			{ reset: ResetInterval.Day, expected: ProductItemInterval.Day },
			{ reset: ResetInterval.Week, expected: ProductItemInterval.Week },
			{ reset: ResetInterval.Quarter, expected: ProductItemInterval.Quarter },
			{ reset: ResetInterval.Year, expected: ProductItemInterval.Year },
		];

		for (const { reset, expected } of intervals) {
			const id = `interval_${expected}`;
			try {
				await autumnV2.products.delete(id);
			} catch (_error) {}

			await autumnV2.products.create({
				id,
				name: `Interval ${expected}`,
				features: [
					{
						feature_id: TestFeature.Messages,
						granted_balance: 100,
						reset: {
							interval: reset,
						},
					},
				],
			} as CreatePlanParams);

			const v1_2 = (await autumnV1_2.products.get(id)) as ApiProduct;
			expect(v1_2.items[0].interval).toBe(expected);
		}
	});

	test("Enterprise plan: base price + tiered usage + proration + rollover + boolean + free trial", async () => {
		const productId = "enterprise_complete";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		await autumnV2.products.create({
			id: "enterprise_complete",
			name: "Enterprise Complete",
			description: "Full-featured enterprise plan with all capabilities",
			group: "",
			add_on: false,
			default: false,
			price: { amount: 49900, interval: BillingInterval.Month },
			features: [
				// Boolean feature (SSO enabled)
				{ feature_id: TestFeature.Dashboard },
				// Metered API calls with tiered pricing (no reset_interval - using price.interval)
				{
					feature_id: TestFeature.Messages,
					granted_balance: 100000,
					// rollover with tiered pricing
					price: {
						interval: BillingInterval.Month,
						usage_model: UsageModel.PayPerUse,
						billing_units: 1000,
						tiers: [
							{ to: 100000, amount: 10 },
							{ to: 500000, amount: 50 },
							{ to: 1000000, amount: 40 },
							{ to: TierInfinite, amount: 30 },
						],
					},
				},
				// Seats with proration (proration requires pricing)
				{
					feature_id: TestFeature.Users,
					granted_balance: 50,
					price: {
						amount: 20,
						interval: BillingInterval.Month,
						usage_model: UsageModel.PayPerUse,
						billing_units: 1,
					},
					proration: {
						on_increase: OnIncrease.ProrateImmediately,
						on_decrease: OnDecrease.Prorate,
					},
				},
			],
			free_trial: {
				duration_type: FreeTrialDuration.Day,
				duration_length: 30,
				card_required: true,
			},
		} as CreatePlanParams);

		// V2 validation
		const v2 = (await autumnV2.products.get("enterprise_complete")) as ApiPlan;
		expect(v2.price!.amount).toBe(49900);
		expect(v2.features).toHaveLength(3);
		expect(v2.description).toBe(
			"Full-featured enterprise plan with all capabilities",
		);
		expect(v2.free_trial).toBeDefined();
		expect(v2.free_trial!.duration_length).toBe(30);

		// Validate boolean feature
		const booleanFeature = v2.features.find(
			(f) => f.feature_id === TestFeature.Dashboard,
		);
		expect(booleanFeature).toBeDefined();

		// Validate metered feature with tiered pricing (no rollover)
		const meteredFeature = v2.features.find(
			(f) => f.feature_id === TestFeature.Messages,
		);
		expect(meteredFeature!.granted_balance).toBe(100000);
		expect(meteredFeature!.price).toBeDefined();
		expect(meteredFeature!.price!.tiers).toHaveLength(4);
		expect(meteredFeature!.price!.billing_units).toBe(1000);

		// Validate seats with proration
		const seatsFeature = v2.features.find(
			(f) => f.feature_id === TestFeature.Users,
		);
		expect(seatsFeature!.granted_balance).toBe(50);
		expect(seatsFeature!.price).toBeDefined();
		expect(seatsFeature!.proration).toBeDefined();
		expect(seatsFeature!.proration!.on_increase).toBe(
			OnIncrease.ProrateImmediately,
		);
		// on_decrease transforms to prorate_immediately when on_increase is prorate_immediately
		expect(seatsFeature!.proration!.on_decrease).toBe(
			OnDecrease.ProrateImmediately,
		);

		// V1.2 validation
		const v1_2 = (await autumnV1_2.products.get(
			"enterprise_complete",
		)) as ApiProduct;
		expect(v1_2.items).toHaveLength(4); // 1 base price + 3 features
		expect(v1_2.free_trial).toBeDefined();
		expect(v1_2.free_trial!.length).toBe(30);

		// Validate base price item
		const basePriceItem = v1_2.items.find((i) => !i.feature_id);
		expect(basePriceItem!.price).toBe(49900);
		expect(basePriceItem!.interval).toBe(ProductItemInterval.Month);

		// Validate metered item has tiers (no rollover)
		const meteredItem = v1_2.items.find(
			(i) => i.feature_id === TestFeature.Messages,
		);
		expect(meteredItem!.tiers).toHaveLength(4);
		expect(meteredItem!.tiers![0].to).toBe(100000);
		expect(meteredItem!.tiers![0].amount).toBe(10);

		// Validate seats item has proration config
		const seatsItem = v1_2.items.find(
			(i) => i.feature_id === TestFeature.Users,
		);
		expect(seatsItem!.price).toBe(20);
		expect(seatsItem!.config).toBeDefined();
		expect(seatsItem!.config!.on_increase).toBe(OnIncrease.ProrateImmediately);
		expect(seatsItem!.config!.on_decrease).toBe(OnDecrease.ProrateImmediately);
	});
});
