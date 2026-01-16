import { describe, expect, test } from "bun:test";
import {
	ApiVersion,
	BillingInterval,
	type CreatePlanParams,
	ProductItemInterval,
	ResetInterval,
	UsageModel,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

describe(chalk.yellowBright("Plan V2 - Mutual Exclusivity Validation"), () => {
	const autumnV2 = new AutumnInt({ version: ApiVersion.V2_0 });
	const autumnV1_2 = new AutumnInt({ version: ApiVersion.V1_2 });

	test("REJECT: reset.interval + price.interval different", async () => {
		const productId = "invalid_both";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		await expectAutumnError({
			errCode: "invalid_inputs",
			func: async () => {
				await autumnV2.products.create({
					id: "invalid_both",
					name: "Invalid Both Intervals",
					features: [
						{
							feature_id: TestFeature.Messages,
							granted_balance: 100,
							reset: {
								interval: ResetInterval.Minute,
							},
							price: {
								amount: 10,
								interval: BillingInterval.Month,
								usage_model: UsageModel.PayPerUse,
								billing_units: 1,
							},
						},
					],
				} as CreatePlanParams);
			},
		});
	});

	test("ACCEPT: only reset_interval (metered, no price)", async () => {
		const productId = "only_reset";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		await autumnV2.products.create({
			id: "only_reset",
			name: "Only Reset Interval",
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

		const v1_2 = (await autumnV1_2.products.get("only_reset")) as any;
		expect(v1_2.items[0].interval).toBe(ProductItemInterval.Month);
		expect(v1_2.items[0].price).toBeUndefined();
	});

	test("ACCEPT: only price.interval (usage pricing, no reset)", async () => {
		const productId = "only_price_interval";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		await autumnV2.products.create({
			id: "only_price_interval",
			name: "Only Price Interval",
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
		} as CreatePlanParams);

		const v1_2 = (await autumnV1_2.products.get("only_price_interval")) as any;
		expect(v1_2.items[0].price).toBe(10);
		expect(v1_2.items[0].interval).toBe(ProductItemInterval.Month);
	});
});
