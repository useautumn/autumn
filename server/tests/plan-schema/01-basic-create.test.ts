import {
	type ApiPlan,
	type ApiProduct,
	BillingInterval,
	type CreatePlanParams,
	ResetInterval,
	UsageModel,
} from "@autumn/shared";
import { setupBefore } from "@tests/before.js";
import { features } from "@tests/global.js";
import { expect } from "chai";
import chalk from "chalk";
import { AutumnCliV2 } from "@/external/autumn/autumnCliV2.js";

describe(chalk.yellowBright("Plan V2 - Basic CREATE Tests"), () => {
	const autumnV2 = new AutumnCliV2({ version: "2.0.0" });
	const autumnV1_2 = new AutumnCliV2({ version: "1.2.0" });
	let _db, _org, _env;

	before(async function () {
		await setupBefore(this);
		_db = this.db;
		_org = this.org;
		_env = this.env;
	});

	it("CREATE: minimal plan (id + name only)", async () => {
		const productId = "min_plan";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		const created = (await autumnV2.products.create({
			id: "min_plan",
			name: "Minimal Plan",
		} as CreatePlanParams)) as ApiPlan;
		// V2 response validation
		expect(created.id).to.equal("min_plan");
		expect(created.features).to.be.empty;

		// V1.2 validation (using items format)
		const v1_2 = (await autumnV1_2.products.get("min_plan")) as ApiProduct;
		expect(v1_2.items).to.be.empty;
		expect(v1_2.is_add_on).to.be.false;
	});

	it("CREATE: monthly base price", async () => {
		const productId = "monthly_base";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		const created = (await autumnV2.products.create({
			id: "monthly_base",
			name: "Monthly Base",
			price: { amount: 2900, interval: BillingInterval.Month },
		} as CreatePlanParams)) as ApiPlan;

		// V2 response validation
		expect(created.price!.amount).to.equal(2900);
		expect(created.price!.interval).to.equal(BillingInterval.Month);

		// V1.2 validation (items format)
		const v1_2 = (await autumnV1_2.products.get("monthly_base")) as ApiProduct;
		const basePrice = v1_2.items.find((i) => !i.feature_id);
		expect(basePrice!.price).to.equal(2900);
		expect(basePrice!.interval).to.equal("month");
	});

	it("CREATE: yearly base price", async () => {
		const productId = "yearly_base";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		const created = (await autumnV2.products.create({
			id: "yearly_base",
			name: "Yearly Base",
			price: { amount: 29900, interval: BillingInterval.Year },
		} as CreatePlanParams)) as ApiPlan;

		// V2 response validation
		expect(created.price!.amount).to.equal(29900);
		expect(created.price!.interval).to.equal(BillingInterval.Year);

		// V1.2 validation (items format)
		const v1_2 = (await autumnV1_2.products.get("yearly_base")) as ApiProduct;
		const basePrice = v1_2.items[0];
		expect(basePrice.price).to.equal(29900);
		expect(basePrice.interval).to.equal("year");
	});

	it("CREATE: description field (V2 only)", async () => {
		const productId = "with_desc";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		const created = (await autumnV2.products.create({
			id: "with_desc",
			name: "With Description",
			description: "Test description for V2",
		} as CreatePlanParams)) as ApiPlan;

		// V2 response validation
		expect(created.description).to.equal("Test description for V2");

		// V1.2 validation - description not in V1.2 schema
		const v1_2 = (await autumnV1_2.products.get("with_desc")) as ApiProduct;
		// @ts-expect-error: Descriptions aren't in the type, but we're just double checking the response.
		expect(v1_2.description).to.be.undefined;
	});

	it("CREATE: add_on and default flags", async () => {
		const productId = "flags_test";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		const created = (await autumnV2.products.create({
			id: "flags_test",
			name: "Flags Test",
			add_on: true,
			default: false,
		} as CreatePlanParams)) as ApiPlan;

		// V2 response validation
		expect(created.add_on).to.be.true;
		expect(created.default).to.be.false;

		// V1.2 validation (items format)
		const v1_2 = (await autumnV1_2.products.get("flags_test")) as ApiProduct;
		expect(v1_2.is_add_on).to.be.true;
		expect(v1_2.is_default).to.be.false;
	});

	it("CREATE: metered feature with monthly reset", async () => {
		const productId = "metered_monthly";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		const created = (await autumnV2.products.create({
			id: productId,
			name: "Metered Monthly",
			features: [
				{
					feature_id: features.metered1.id,
					granted_balance: 1000,
					reset: {
						interval: ResetInterval.Month,
					},
				},
			],
		} as CreatePlanParams)) as ApiPlan;

		// V2 response validation
		expect(created.features).to.have.lengthOf(1);
		expect(created.features[0].granted_balance).to.equal(1000);

		// V1.2 validation (items format)
		const v1_2 = (await autumnV1_2.products.get(productId)) as ApiProduct;
		expect(v1_2.items[0].included_usage).to.equal(1000);
		expect(v1_2.items[0].interval).to.equal("month");
	});

	it("CREATE: boolean feature", async () => {
		const productId = "bool_plan";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		const created = (await autumnV2.products.create({
			id: "bool_plan",
			name: "Boolean Plan",
			features: [{ feature_id: features.boolean1.id }],
		} as CreatePlanParams)) as ApiPlan;

		// V2 response validation
		expect(created.features).to.have.lengthOf(1);
		expect(created.features[0].feature_id).to.equal(features.boolean1.id);

		// V1.2 validation (items format)
		const v1_2 = (await autumnV1_2.products.get("bool_plan")) as ApiProduct;
		expect(v1_2.items[0].feature_id).to.equal(features.boolean1.id);
	});

	it("CREATE: feature with usage pricing (pay-per-use)", async () => {
		const productId = "usage_price";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		const created = (await autumnV2.products.create({
			id: "usage_price",
			name: "Usage Price",
			features: [
				{
					feature_id: features.metered1.id,
					// No reset_interval - using price.interval instead (mutually exclusive)
					price: {
						amount: 10,
						interval: BillingInterval.Month,
						usage_model: UsageModel.PayPerUse,
						billing_units: 1,
					},
				},
			],
		} as CreatePlanParams)) as ApiPlan;

		// V2 response validation
		expect(created.features[0].price!.amount).to.equal(10);
		expect(created.features[0].price!.usage_model).to.equal(
			UsageModel.PayPerUse,
		);

		// V1.2 validation (items format)
		const v1_2 = (await autumnV1_2.products.get("usage_price")) as ApiProduct;
		expect(v1_2.items[0].price).to.equal(10);
		expect(v1_2.items[0].usage_model).to.equal(UsageModel.PayPerUse);
		expect(v1_2.items[0].billing_units).to.equal(1);
		expect(v1_2.items[0].interval).to.equal("month"); // Uses price.interval
	});

	it("CREATE: feature with tiered pricing", async () => {
		const productId = "tiered_pricing";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		const created = (await autumnV2.products.create({
			id: "tiered_pricing",
			name: "Tiered Pricing Plan",
			features: [
				{
					feature_id: features.metered1.id,
					price: {
						tiers: [
							{ to: 100, amount: 0.1 },
							{ to: 500, amount: 0.08 },
							{ to: "inf", amount: 0.05 },
						],
						interval: BillingInterval.Month,
						usage_model: UsageModel.PayPerUse,
						billing_units: 1,
					},
				},
			],
		} as CreatePlanParams)) as ApiPlan;

		// V2 response validation
		expect(created.features[0].price!.tiers).to.have.lengthOf(3);
		expect(created.features[0].price!.tiers![0]).to.deep.equal({
			to: 100,
			amount: 0.1,
		});
		expect(created.features[0].price!.tiers![1]).to.deep.equal({
			to: 500,
			amount: 0.08,
		});
		expect(created.features[0].price!.tiers![2]).to.deep.equal({
			to: "inf",
			amount: 0.05,
		});
		expect(created.features[0].price!.usage_model).to.equal(
			UsageModel.PayPerUse,
		);

		// V1.2 validation (items format)
		const v1_2 = (await autumnV1_2.products.get(
			"tiered_pricing",
		)) as ApiProduct;
		expect(v1_2.items[0].tiers).to.have.lengthOf(3);
		expect(v1_2.items[0].tiers![0]).to.deep.equal({
			to: 100,
			amount: 0.1,
		});
		expect(v1_2.items[0].tiers![1]).to.deep.equal({
			to: 500,
			amount: 0.08,
		});
		expect(v1_2.items[0].tiers![2]).to.deep.equal({
			to: "inf",
			amount: 0.05,
		});
		expect(v1_2.items[0].usage_model).to.equal(UsageModel.PayPerUse);
		expect(v1_2.items[0].interval).to.equal("month");
	});
});
