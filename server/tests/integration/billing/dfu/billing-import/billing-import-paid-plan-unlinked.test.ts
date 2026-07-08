/**
 * dfu.flash — a paid recurring plan imported with no linked subscription can't be
 * billed/managed, so it images but comes back flagged (mismatch), not blocked.
 */

import { expect, test } from "bun:test";
import {
	type FlashClient,
	callFlash,
	createRealStripeCustomer,
} from "@tests/integration/billing/dfu/billing-import/utils/flashTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("dfu.flash: paid recurring plan with no subscription is flagged as mismatch")}`,
	async () => {
		const customerId = "dfu-flash-paid-unlinked";
		// `pro` has a $20/mo base price — a paid recurring plan.
		const pro = products.pro({
			id: "dfu-paid-unlinked",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});

		const stripeCustomerId = await createRealStripeCustomer(ctx, {
			email: `${customerId}@example.com`,
		});

		const payload = {
			customer_id: customerId,
			processors: [{ type: "stripe", id: stripeCustomerId }],
			// Paid recurring plan, but NO link.subscription_id → Autumn can't manage it.
			billables: [
				{
					processor: "stripe",
					plan: {
						plan_id: pro.id,
						status: "active",
						started_at: Date.now() - 1000 * 60 * 60 * 24 * 30,
						balances: [{ feature_id: TestFeature.Messages, usage: 10 }],
					},
				},
			],
		};

		const flashRes = await callFlash(autumnV2_2 as FlashClient, payload);
		const flashed = flashRes.result?.flashed?.find((f) => f.plan_id === pro.id);
		expect(flashed?.customer_product_id).toBeTruthy();
		expect(flashed?.mismatch).toBe(true);
		expect(flashed?.reason).toBe("paid_plan_without_subscription");
	},
);
