import { describe, expect, test } from "bun:test";
import {
	type ApiPlan,
	type ApiProduct,
	BillingInterval,
	type CreatePlanParams,
	ProductItemInterval,
} from "@autumn/shared";
import chalk from "chalk";
import { AutumnCliV2 } from "@/external/autumn/autumnCliV2.js";

describe(chalk.yellowBright("Plan V2 - Base Pricing Tests"), () => {
	const autumnV2 = new AutumnCliV2({ version: "2.0.0" });
	const autumnV1_2 = new AutumnCliV2({ version: "1.2.0" });

	test("CREATE: monthly base price", async () => {
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
		expect(created.price!.amount).toBe(2900);
		expect(created.price!.interval).toBe(BillingInterval.Month);

		// V1.2 validation (items format)
		const v1_2 = (await autumnV1_2.products.get("monthly_base")) as ApiProduct;
		const basePrice = v1_2.items.find((i) => !i.feature_id);
		expect(basePrice!.price).toBe(2900);
		expect(basePrice!.interval).toBe(ProductItemInterval.Month);
	});

	test("CREATE: yearly base price", async () => {
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
		expect(created.price!.amount).toBe(29900);
		expect(created.price!.interval).toBe(BillingInterval.Year);

		// V1.2 validation (items format)
		const v1_2 = (await autumnV1_2.products.get("yearly_base")) as ApiProduct;
		const basePrice = v1_2.items[0];
		expect(basePrice.price).toBe(29900);
		expect(basePrice.interval).toBe(ProductItemInterval.Year);
	});
});
