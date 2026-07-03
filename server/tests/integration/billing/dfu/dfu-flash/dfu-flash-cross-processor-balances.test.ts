/**
 * dfu.flash — cross-processor same add-on (contract 5): the same plan flashed on
 * both Stripe and RevenueCat with NON-ZERO prepaid balances yields two
 * cusProducts, each with the correct (non-zero) balance.
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV5 } from "@autumn/shared";
import {
	type FlashClient,
	callFlash,
	createRealStripeSub,
} from "@tests/integration/billing/dfu/dfu-flash/utils/flashTestUtils.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("dfu.flash: cross-processor add-on keeps both prepaid balances non-zero")}`,
	async () => {
		const customerId = "dfu-flash-cross-processor";
		const seatPack = products.base({
			id: "dfu-seat-pack",
			isAddOn: true,
			items: [items.prepaidMessages({ includedUsage: 0 })],
		});

		const { autumnV2_2, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [seatPack] })],
			actions: [],
		});

		const { customerId: stripeCustomerId, subscriptionId } =
			await createRealStripeSub(ctx, { email: `${customerId}@example.com` });

		const payload = {
			customer_id: customerId,
			processors: [{ type: "stripe", id: stripeCustomerId }],
			billables: [
				{
					processor: "stripe",
					link: { subscription_id: subscriptionId },
					phases: [
						{
							starts_at: "now",
							plans: [
								{
									plan_id: seatPack.id,
									status: "active",
									feature_quantities: [
										{ feature_id: TestFeature.Messages, quantity: 200 },
									],
									balances: [{ feature_id: TestFeature.Messages, usage: 50 }],
								},
							],
						},
					],
				},
				{
					processor: "revenuecat",
					phases: [
						{
							starts_at: "now",
							plans: [
								{
									plan_id: seatPack.id,
									status: "active",
									feature_quantities: [
										{ feature_id: TestFeature.Messages, quantity: 300 },
									],
									balances: [{ feature_id: TestFeature.Messages, usage: 100 }],
								},
							],
						},
					],
				},
			],
		};

		const flashRes = await callFlash(autumnV2_2 as FlashClient, payload);

		// ── Contract 5: two cusProducts flashed, both non-zero balances. ──
		const stripeFlashed = flashRes.result?.flashed?.find(
			(f) => f.processor === "stripe" && f.plan_id === seatPack.id,
		);
		const rcFlashed = flashRes.result?.flashed?.find(
			(f) => f.processor === "revenuecat" && f.plan_id === seatPack.id,
		);
		expect(stripeFlashed?.customer_product_id).toBeTruthy();
		expect(rcFlashed?.customer_product_id).toBeTruthy();

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		// Combined remaining: (200-50) + (300-100) = 350; regression = must not be 0.
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining: 350,
		});
	},
);
