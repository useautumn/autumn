import { describe, expect, test } from "bun:test";
import {
	type ApiPlan,
	type ApiProduct,
	BillingInterval,
	type CreatePlanParams,
	ProductItemInterval,
	UsageModel,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import chalk from "chalk";
import { AutumnCliV2 } from "@/external/autumn/autumnCliV2.js";

describe(chalk.yellowBright("Plan V2 - Tiered Pricing Tests"), () => {
	const autumnV2 = new AutumnCliV2({ version: "2.0.0" });
	const autumnV1_2 = new AutumnCliV2({ version: "1.2.0" });

	test("CREATE: feature with tiered pricing", async () => {
		const productId = "tiered_pricing";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		const created = (await autumnV2.products.create({
			id: "tiered_pricing",
			name: "Tiered Pricing Plan",
			features: [
				{
					feature_id: TestFeature.Messages,
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
		expect(created.features[0].price!.tiers).toHaveLength(3);
		expect(created.features[0].price!.tiers![0]).toEqual({
			to: 100,
			amount: 0.1,
		});
		expect(created.features[0].price!.tiers![1]).toEqual({
			to: 500,
			amount: 0.08,
		});
		expect(created.features[0].price!.tiers![2]).toEqual({
			to: "inf",
			amount: 0.05,
		});
		expect(created.features[0].price!.usage_model).toBe(UsageModel.PayPerUse);

		// V1.2 validation (items format)
		const v1_2 = (await autumnV1_2.products.get(
			"tiered_pricing",
		)) as ApiProduct;
		expect(v1_2.items[0].tiers).toHaveLength(3);
		expect(v1_2.items[0].tiers![0]).toEqual({
			to: 100,
			amount: 0.1,
		});
		expect(v1_2.items[0].tiers![1]).toEqual({
			to: 500,
			amount: 0.08,
		});
		expect(v1_2.items[0].tiers![2]).toEqual({
			to: "inf",
			amount: 0.05,
		});
		expect(v1_2.items[0].usage_model).toBe(UsageModel.PayPerUse);
		expect(v1_2.items[0].interval).toBe(ProductItemInterval.Month);
	});
});
