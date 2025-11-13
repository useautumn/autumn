import { describe, expect, test } from "bun:test";
import {
	type ApiPlan,
	type ApiProduct,
	BillingInterval,
	type CreatePlanParams,
	ProductItemInterval,
	UsageModel,
} from "@autumn/shared";
import chalk from "chalk";
import { AutumnCliV2 } from "@/external/autumn/autumnCliV2.js";
import { TestFeature } from "../../setup/v2Features";

describe(chalk.yellowBright("Plan V2 - Usage Pricing Tests"), () => {
	const autumnV2 = new AutumnCliV2({ version: "2.0.0" });
	const autumnV1_2 = new AutumnCliV2({ version: "1.2.0" });

	test("CREATE: feature with usage pricing (pay-per-use)", async () => {
		const productId = "usage_price";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		const created = (await autumnV2.products.create({
			id: "usage_price",
			name: "Usage Price",
			features: [
				{
					feature_id: TestFeature.Messages,
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
		expect(created.features[0].price!.amount).toBe(10);
		expect(created.features[0].price!.usage_model).toBe(UsageModel.PayPerUse);

		// V1.2 validation (items format)
		const v1_2 = (await autumnV1_2.products.get("usage_price")) as ApiProduct;
		expect(v1_2.items[0].price).toBe(10);
		expect(v1_2.items[0].usage_model).toBe(UsageModel.PayPerUse);
		expect(v1_2.items[0].billing_units).toBe(1);
		expect(v1_2.items[0].interval).toBe(ProductItemInterval.Month); // Uses price.interval
	});
});
