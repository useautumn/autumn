import { describe, expect, test } from "bun:test";
import {
	type ApiPlan,
	type ApiProduct,
	type CreatePlanParams,
	ProductItemInterval,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import chalk from "chalk";
import { AutumnCliV2 } from "@/external/autumn/autumnCliV2.js";

describe(
	chalk.yellowBright("Plan V2 - Metered Feature with Reset Tests"),
	() => {
		const autumnV2 = new AutumnCliV2({ version: "2.0.0" });
		const autumnV1_2 = new AutumnCliV2({ version: "1.2.0" });

		test("CREATE: metered feature with monthly reset", async () => {
			const productId = "metered_monthly";
			try {
				await autumnV2.products.delete(productId);
			} catch (_error) {}

			const created = (await autumnV2.products.create({
				id: productId,
				name: "Metered Monthly",
				features: [
					{
						feature_id: TestFeature.Messages,
						granted_balance: 1000,
						reset: {
							interval: ResetInterval.Month,
						},
					},
				],
			} as CreatePlanParams)) as ApiPlan;

			// V2 response validation
			expect(created.features).toHaveLength(1);
			expect(created.features[0].granted_balance).toBe(1000);

			// V1.2 validation (items format)
			const v1_2 = (await autumnV1_2.products.get(productId)) as ApiProduct;
			expect(v1_2.items[0].included_usage).toBe(1000);
			expect(v1_2.items[0].interval).toBe(ProductItemInterval.Month);
		});
	},
);
