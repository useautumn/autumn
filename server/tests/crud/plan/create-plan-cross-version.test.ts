import { describe, expect, test } from "bun:test";
import {
	type ApiPlan,
	type ApiProduct,
	ApiVersion,
	BillingInterval,
	type CreatePlanParams,
	FreeTrialDuration,
	Infinite,
	ProductItemInterval,
	ResetInterval,
	TierInfinite,
	UsageModel,
} from "@autumn/shared";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { TestFeature } from "../../setup/v2Features.js";

describe(chalk.yellowBright("Plan V2 - Cross-Version Consistency"), () => {
	const autumnV2 = new AutumnInt({ version: ApiVersion.V2_0 });
	const autumnV1_2 = new AutumnInt({ version: ApiVersion.V1_2 });

	test("V2 CREATE → V1.2 GET: field transformations", async () => {
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
					feature_id: TestFeature.Messages,
					granted_balance: 100,
					reset: {
						interval: ResetInterval.Month,
					},
				},
			],
		} as CreatePlanParams);

		const v1_2 = (await autumnV1_2.products.get("cross_v2")) as ApiProduct;

		// Field renames
		expect(v1_2.is_add_on).toBe(true);
		expect(v1_2.is_default).toBe(false);

		// Structure transformations
		expect(v1_2.items).toHaveLength(2); // base price + feature

		const basePrice = v1_2.items.find((i) => !i.feature_id);
		expect(basePrice!.price).toBe(1000);

		const feature = v1_2.items.find(
			(i) => i.feature_id === TestFeature.Messages,
		);
		expect(feature!.included_usage).toBe(100);
	});

	test("Round-trip: V2 → V1.2 → V2 data consistency", async () => {
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
					feature_id: TestFeature.Messages,
					granted_balance: 500,
					reset: {
						interval: ResetInterval.Month,
					},
				},
			],
		} as CreatePlanParams;

		await autumnV2.products.create(original);

		const backToV2 = (await autumnV2.products.get("roundtrip")) as ApiPlan;
		expect(backToV2.name).toBe(original.name);
		expect(backToV2.price!.amount).toBe(original.price!.amount);
		expect(backToV2.features.length).toBe(1);
		expect(backToV2.features[0].granted_balance).toBe(500);
	});

	test("Free trial transformation: V2 duration_type → V1.2 duration", async () => {
		const productId = "trial_transform";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		await autumnV2.products.create({
			id: "trial_transform",
			name: "Trial Transform",
			price: { amount: 2900, interval: BillingInterval.Month },
			free_trial: {
				duration_type: FreeTrialDuration.Day,
				duration_length: 7,
				card_required: true,
			},
		} as CreatePlanParams);

		const v2 = (await autumnV2.products.get("trial_transform")) as ApiPlan;
		expect(v2.free_trial!.duration_type).toBe(FreeTrialDuration.Day);
		expect(v2.free_trial!.duration_length).toBe(7);

		const v1_2 = (await autumnV1_2.products.get(
			"trial_transform",
		)) as ApiProduct;
		expect(v1_2.free_trial!.duration).toBe(ProductItemInterval.Day);
		expect(v1_2.free_trial!.length).toBe(7);
		expect(v1_2.free_trial!.unique_fingerprint).toBe(true); // Always true in V1.2
	});

	test("Unlimited feature transformation", async () => {
		const productId = "unlimited_transform";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		await autumnV2.products.create({
			id: "unlimited_transform",
			name: "Unlimited Transform",
			features: [
				{
					feature_id: TestFeature.Messages,
					unlimited: true,
				},
			],
		} as CreatePlanParams);

		const v2 = (await autumnV2.products.get("unlimited_transform")) as ApiPlan;
		expect(v2.features[0].unlimited).toBe(true);
		expect(v2.features[0].granted_balance).toBe(0);

		const v1_2 = (await autumnV1_2.products.get(
			"unlimited_transform",
		)) as ApiProduct;
		expect(v1_2.items[0].included_usage).toBe(Infinite);
	});

	test("Tiered pricing transformation", async () => {
		const productId = "tiered_transform";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		await autumnV2.products.create({
			id: "tiered_transform",
			name: "Tiered Transform",
			features: [
				{
					feature_id: TestFeature.Messages,
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
		expect(v1_2.items[0].tiers).toHaveLength(3);
		expect(v1_2.items[0].tiers![2].to).toBe(TierInfinite);
	});
});
