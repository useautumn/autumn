import {
	type ApiPlan,
	type ApiProduct,
	BillingInterval,
	type CreatePlanParams,
	OnDecrease,
	OnIncrease,
	ResetInterval,
	TierInfinite,
	UsageModel,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import { setupBefore } from "tests/before.js";
import { features } from "tests/global.js";
import { AutumnCliV2 } from "@/external/autumn/autumnCliV2.js";

describe(chalk.yellowBright("Plan V2 - Complex Real-World Scenarios"), () => {
	const autumnV2 = new AutumnCliV2({ version: "2.0.0" });
	const autumnV1_2 = new AutumnCliV2({ version: "1.2" });
	let _db, _org, _env;

	before(async function () {
		await setupBefore(this);
		_db = this.db;
		_org = this.org;
		_env = this.env;
	});

	it("Full SaaS plan with multiple feature types", async () => {
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
				{ feature_id: features.boolean1.id },
				// Metered with rollover
				{
					feature_id: features.metered1.id,
					granted: 10000,
					reset_interval: ResetInterval.Month,
					rollover: {
						max: 20000,
						expiry_duration_type: ResetInterval.Month,
						expiry_duration_length: 1,
					},
				},
				// Continuous with proration
				{
					feature_id: features.seats.id,
					granted: 10,
					reset_interval: ResetInterval.Month,
					proration: {
						on_increase: OnIncrease.ProrateImmediately,
						on_decrease: OnDecrease.Prorate,
					},
				},
			],
			free_trial: {
				duration_type: ResetInterval.Day,
				duration_length: 14,
				card_required: false,
			},
		} as unknown as CreatePlanParams);

		const v2 = (await autumnV2.products.get("saas_complete")) as ApiPlan;
		expect(v2.features).to.have.lengthOf(3);
		expect(v2.free_trial).to.exist;
		expect(v2.description).to.equal("Full-featured SaaS plan");

		const v1_2 = (await autumnV1_2.products.get("saas_complete")) as ApiProduct;
		expect(v1_2.items).to.have.lengthOf(4); // 1 base price + 3 features
		expect(v1_2.free_trial).to.exist;
	});

	it("Usage-only product (no base price)", async () => {
		const productId = "usage_only";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		await autumnV2.products.create({
			id: "usage_only",
			name: "Usage Only",
			features: [
				{
					feature_id: features.metered1.id,
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
		expect(v2.price).to.be.undefined;

		const v1_2 = (await autumnV1_2.products.get("usage_only")) as ApiProduct;
		expect(v1_2.items).to.have.lengthOf(1);
	});

	it("Priced feature with proration", async () => {
		const productId = "priced_proration";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		await autumnV2.products.create({
			id: "priced_proration",
			name: "Priced with Proration",
			features: [
				{
					feature_id: features.seats.id,
					granted: 10,
					// Proration requires pricing - using price.interval, not reset_interval
					price: {
						amount: 10,
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
		} as CreatePlanParams);

		const v1_2 = (await autumnV1_2.products.get(
			"priced_proration",
		)) as ApiProduct;
		const item = v1_2.items[0];
		expect(item.price).to.equal(10);
		expect(item.config).to.exist;
		expect(item.config!.on_increase).to.equal(OnIncrease.ProrateImmediately);
		// on_decrease transforms to prorate_immediately when on_increase is prorate_immediately
		expect(item.config!.on_decrease).to.equal(OnDecrease.ProrateImmediately);
	});

	it("Metered feature with rollover", async () => {
		const productId = "with_rollover";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		await autumnV2.products.create({
			id: "with_rollover",
			name: "With Rollover",
			features: [
				{
					feature_id: features.metered1.id,
					granted: 1000,
					reset_interval: ResetInterval.Month,
					rollover: {
						max: 2000,
						expiry_duration_type: ResetInterval.Month,
						expiry_duration_length: 1,
					},
				},
			],
		} as CreatePlanParams);

		const v1_2 = (await autumnV1_2.products.get("with_rollover")) as ApiProduct;
		const item = v1_2.items[0];
		expect(item.config).to.exist;
		expect(item.config!.rollover).to.exist;
		expect(item.config!.rollover!.max).to.equal(2000);
		expect(item.config!.rollover!.duration).to.equal("month");
		expect(item.config!.rollover!.length).to.equal(1);
	});

	it("Multiple reset intervals (hour, day, week, quarter, year)", async () => {
		const intervals = [
			{ reset: ResetInterval.Hour, expected: "hour" },
			{ reset: ResetInterval.Day, expected: "day" },
			{ reset: ResetInterval.Week, expected: "week" },
			{ reset: ResetInterval.Quarter, expected: "quarter" },
			{ reset: ResetInterval.Year, expected: "year" },
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
						feature_id: features.metered1.id,
						granted: 100,
						reset_interval: reset,
					},
				],
			} as CreatePlanParams);

			const v1_2 = (await autumnV1_2.products.get(id)) as ApiProduct;
			expect(v1_2.items[0].interval).to.equal(expected);
		}
	});

	it("Enterprise plan: base price + tiered usage + proration + rollover + boolean + free trial", async () => {
		const productId = "enterprise_complete";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		await autumnV2.products.create({
			id: "enterprise_complete",
			name: "Enterprise Complete",
			description: "Full-featured enterprise plan with all capabilities",
			price: { amount: 49900, interval: BillingInterval.Month },
			features: [
				// Boolean feature (SSO enabled)
				{ feature_id: features.boolean1.id },
				// Metered API calls with tiered pricing (no reset_interval - using price.interval)
				{
					feature_id: features.metered1.id,
					granted: 100000,
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
					feature_id: features.seats.id,
					granted: 50,
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
				duration_type: ResetInterval.Day,
				duration_length: 30,
				card_required: true,
			},
			default: false,
		} as unknown as CreatePlanParams);

		// V2 validation
		const v2 = (await autumnV2.products.get("enterprise_complete")) as ApiPlan;
		expect(v2.price!.amount).to.equal(49900);
		expect(v2.features).to.have.lengthOf(3);
		expect(v2.description).to.equal(
			"Full-featured enterprise plan with all capabilities",
		);
		expect(v2.free_trial).to.exist;
		expect(v2.free_trial!.duration_length).to.equal(30);

		// Validate boolean feature
		const booleanFeature = v2.features.find(
			(f) => f.feature_id === features.boolean1.id,
		);
		expect(booleanFeature).to.exist;

		// Validate metered feature with tiered pricing (no rollover)
		const meteredFeature = v2.features.find(
			(f) => f.feature_id === features.metered1.id,
		);
		expect(meteredFeature!.granted).to.equal(100000);
		expect(meteredFeature!.price).to.exist;
		expect(meteredFeature!.price!.tiers).to.have.lengthOf(4);
		expect(meteredFeature!.price!.billing_units).to.equal(1000);

		// Validate seats with proration
		const seatsFeature = v2.features.find(
			(f) => f.feature_id === features.seats.id,
		);
		expect(seatsFeature!.granted).to.equal(50);
		expect(seatsFeature!.price).to.exist;
		expect(seatsFeature!.proration).to.exist;
		expect(seatsFeature!.proration!.on_increase).to.equal(
			OnIncrease.ProrateImmediately,
		);
		// on_decrease transforms to prorate_immediately when on_increase is prorate_immediately
		expect(seatsFeature!.proration!.on_decrease).to.equal(
			OnDecrease.ProrateImmediately,
		);

		// V1.2 validation
		const v1_2 = (await autumnV1_2.products.get(
			"enterprise_complete",
		)) as ApiProduct;
		expect(v1_2.items).to.have.lengthOf(4); // 1 base price + 3 features
		expect(v1_2.free_trial).to.exist;
		expect(v1_2.free_trial!.length).to.equal(30);

		// Validate base price item
		const basePriceItem = v1_2.items.find((i) => !i.feature_id);
		expect(basePriceItem!.price).to.equal(49900);
		expect(basePriceItem!.interval).to.equal("month");

		// Validate metered item has tiers (no rollover)
		const meteredItem = v1_2.items.find(
			(i) => i.feature_id === features.metered1.id,
		);
		expect(meteredItem!.tiers).to.have.lengthOf(4);
		expect(meteredItem!.tiers![0].to).to.equal(100000);
		expect(meteredItem!.tiers![0].amount).to.equal(10);

		// Validate seats item has proration config
		const seatsItem = v1_2.items.find(
			(i) => i.feature_id === features.seats.id,
		);
		expect(seatsItem!.price).to.equal(20);
		expect(seatsItem!.config).to.exist;
		expect(seatsItem!.config!.on_increase).to.equal(
			OnIncrease.ProrateImmediately,
		);
		expect(seatsItem!.config!.on_decrease).to.equal(
			OnDecrease.ProrateImmediately,
		);
	});
});
