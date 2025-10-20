import {
	type ApiPlan,
	type ApiProduct,
	BillingInterval,
	type CreatePlanParams,
	Infinite,
	ResetInterval,
	TierInfinite,
	UsageModel,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import { setupBefore } from "tests/before.js";
import { features } from "tests/global.js";
import { AutumnCliV2 } from "@/external/autumn/autumnCliV2.js";

describe(chalk.yellowBright("Plan V2 - Cross-Version Consistency"), () => {
	const autumnV2 = new AutumnCliV2({ version: "2.0.0" });
	const autumnV1_2 = new AutumnCliV2({ version: "1.2" });
	let _db, _org, _env;

	before(async function () {
		await setupBefore(this);
		_db = this.db;
		_org = this.org;
		_env = this.env;
	});

	it("V2 CREATE → V1.2 GET: field transformations", async () => {
		const productId = "cross_v2";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		await autumnV2.products.create({
			id: "cross_v2",
			name: "Cross Version V2",
			add_on: true,
			default: false,
			price: { amount: 1000, interval: BillingInterval.Month },
			features: [
				{
					feature_id: features.metered1.id,
					granted: 100,
					reset_interval: ResetInterval.Month,
				},
			],
		} as CreatePlanParams);

		const v1_2 = (await autumnV1_2.products.get("cross_v2")) as ApiProduct;

		// Field renames
		expect(v1_2.is_add_on).to.be.true;
		expect(v1_2.is_default).to.be.false;

		// Structure transformations
		expect(v1_2.items).to.have.lengthOf(2); // base price + feature

		const basePrice = v1_2.items.find((i) => !i.feature_id);
		expect(basePrice!.price).to.equal(1000);

		const feature = v1_2.items.find(
			(i) => i.feature_id === features.metered1.id,
		);
		expect(feature!.included_usage).to.equal(100);
	});

	it("Round-trip: V2 → V1.2 → V2 data consistency", async () => {
		const productId = "roundtrip";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		const original = {
			id: "roundtrip",
			name: "Round Trip",
			price: { amount: 5000, interval: BillingInterval.Month },
			features: [
				{
					feature_id: features.metered1.id,
					granted: 500,
					reset_interval: ResetInterval.Month,
				},
			],
		};

		await autumnV2.products.create(original as CreatePlanParams);

		const _asV1_2 = (await autumnV1_2.products.get("roundtrip")) as ApiProduct;
		const backToV2 = (await autumnV2.products.get("roundtrip")) as ApiPlan;
		expect(backToV2.name).to.equal(original.name);
		expect(backToV2.price!.amount).to.equal(original.price.amount);
		expect(backToV2.features.length).to.equal(1);
		expect(backToV2.features[0].granted).to.equal(500);
	});

	it("Free trial transformation: V2 duration_type → V1.2 duration", async () => {
		const productId = "trial_transform";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		await autumnV2.products.create({
			id: "trial_transform",
			name: "Trial Transform",
			price: { amount: 2900, interval: BillingInterval.Month },
			free_trial: {
				duration_type: ResetInterval.Day,
				duration_length: 7,
				card_required: true,
			},
		} as CreatePlanParams);

		const v2 = (await autumnV2.products.get("trial_transform")) as ApiPlan;
		expect(v2.free_trial!.duration_type).to.equal(ResetInterval.Day);
		expect(v2.free_trial!.duration_length).to.equal(7);

		const v1_2 = (await autumnV1_2.products.get(
			"trial_transform",
		)) as ApiProduct;
		expect(v1_2.free_trial!.duration).to.equal("day");
		expect(v1_2.free_trial!.length).to.equal(7);
		expect(v1_2.free_trial!.unique_fingerprint).to.be.true; // Always true in V1.2
	});

	it("Unlimited feature transformation", async () => {
		const productId = "unlimited_transform";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		await autumnV2.products.create({
			id: "unlimited_transform",
			name: "Unlimited Transform",
			features: [
				{
					feature_id: features.metered1.id,
					unlimited: true,
				},
			],
		} as CreatePlanParams);

		const v2 = (await autumnV2.products.get("unlimited_transform")) as ApiPlan;
		expect(v2.features[0].unlimited).to.be.true;
		expect(v2.features[0].granted).to.equal(0);

		const v1_2 = (await autumnV1_2.products.get(
			"unlimited_transform",
		)) as ApiProduct;
		expect(v1_2.items[0].included_usage).to.equal(Infinite);
	});

	it("Tiered pricing transformation", async () => {
		const productId = "tiered_transform";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		await autumnV2.products.create({
			id: "tiered_transform",
			name: "Tiered Transform",
			features: [
				{
					feature_id: features.metered1.id,
					price: {
						interval: BillingInterval.Month,
						usage_model: UsageModel.PayPerUse,
						billing_units: 1,
						tiers: [
							{ to: 100, amount: 10 },
							{ to: 1000, amount: 5 },
							{ to: TierInfinite, amount: 2 },
						],
					},
				},
			],
		} as CreatePlanParams);

		const v1_2 = (await autumnV1_2.products.get(
			"tiered_transform",
		)) as ApiProduct;
		expect(v1_2.items[0].tiers).to.have.lengthOf(3);
		expect(v1_2.items[0].tiers![2].to).to.equal(TierInfinite);
	});
});
