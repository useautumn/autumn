/**
 * dfu.flash — response returns the freshly-imaged customer: the flash response
 * carries a fresh customer reflecting the just-imaged plan + balance (not stale).
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV5 } from "@autumn/shared";
import {
	type FlashClient,
	callFlash,
	createRealStripeSub,
} from "@tests/integration/billing/dfu/billing-import/utils/flashTestUtils.js";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("dfu.flash: response returns the fresh imaged customer with correct balance")}`,
	async () => {
		const customerId = "dfu-flash-returns-fresh-customer";
		const pro = products.pro({
			id: "dfu-fresh-customer-pro",
			items: [items.monthlyMessages({ includedUsage: 15_000_000 })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
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
									plan_id: pro.id,
									status: "active",
									balances: [
										{ feature_id: TestFeature.Messages, usage: 5_000_000 },
									],
								},
							],
						},
					],
				},
			],
		};

		const flashRes = await callFlash(autumnV2_3 as FlashClient, payload);

		// Response carries a fresh customer reflecting the just-imaged plan + balance.
		const customer = flashRes.result?.customer as ApiCustomerV5 | null;
		expect(customer).toBeTruthy();
		await expectCustomerProducts({
			customer: customer as ApiCustomerV5,
			active: [pro.id],
		});
		expectBalanceCorrect({
			customer: customer as ApiCustomerV5,
			featureId: TestFeature.Messages,
			remaining: 10_000_000,
			usage: 5_000_000,
		});
	},
);
