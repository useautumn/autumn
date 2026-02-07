import { expect, test } from "bun:test";
import { FreeTrialDuration } from "@shared/index";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { ProductStatus } from "autumn-js";
import chalk from "chalk";

const testCase = "free-trial-reset-usage";
test.concurrent(`${chalk.yellowBright(`${testCase}: ensure free trial resets usage on correct date`)}`, async () => {
	const customerId = testCase;
	const { autumnV1, autumnV2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({
				list: [
					products.pro({
						id: "pro",
						items: [
							items.monthlyMessages({
								includedUsage: 100,
								resetUsageWhenEnabled: true,
							}),
						],
						freeTrial: {
							length: 7,
							duration: FreeTrialDuration.Day,
							cardRequired: true,
							uniqueFingerprint: false,
						},
					}),
				],
			}),
		],
		actions: [
			s.attach({ productId: "pro" }),
			s.assert(
				"user is on pro, and is trialing with correct balance and next reset at",
				async (ctx) => {
					const customer = await ctx.autumnV1.customers.get(customerId);
					const product = customer.products.find(
						(p) => p.id === `pro_${testCase}`,
					);
					expect(
						product?.status,
						`Product status is not trialing, current status: ${product?.status}, expected status: ${ProductStatus.Trialing}`,
					).toBe(ProductStatus.Trialing);

					const messages = customer.features[TestFeature.Messages];
					const now = Date.now();
					const resetAt = new Date(messages.next_reset_at!).getTime();
					const balance = messages.balance;
					const gapDays = Math.round((resetAt - now) / (1000 * 60 * 60 * 24));

					expect(
						gapDays,
						`Days until next reset is not correct, current gap: ${gapDays}, expected gap: between 35 and 37`,
					).toBeGreaterThanOrEqual(35);

					expect(
						gapDays,
						`Days until next reset is not correct, current gap: ${gapDays}, expected gap: between 35 and 37`,
					).toBeLessThanOrEqual(37);

					expect(
						balance,
						`Balance is not correct, current balance: ${balance}, expected balance: 100`,
					).toBe(100);
				},
			),
		],
	});
});
