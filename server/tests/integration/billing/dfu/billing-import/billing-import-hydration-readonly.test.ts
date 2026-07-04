/**
 * dfu.flash hydration — flashing is read-only: the Stripe subscription is never
 * mutated (status / canceled_at / cancel_at_period_end / period end unchanged).
 */

import { expect, test } from "bun:test";
import { createStripeSubscriptionFromProduct } from "@tests/integration/billing/sync/utils/syncTestUtils.js";
import {
	type FlashClient,
	callFlash,
} from "@tests/integration/billing/dfu/billing-import/utils/flashTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("dfu.flash: flashing does not mutate the Stripe subscription")}`,
	async () => {
		const customerId = "dfu-flash-hydrate-readonly";
		const pro = products.pro({
			id: "dfu-hydrate-readonly-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const sub = await createStripeSubscriptionFromProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		const before = await ctx.stripeCli.subscriptions.retrieve(sub.id);

		const payload = {
			customer_id: customerId,
			processors: [{ type: "stripe", id: sub.customer as string }],
			billables: [
				{
					processor: "stripe",
					link: { subscription_id: sub.id },
					phases: [{ starts_at: "now", plans: [{ plan_id: pro.id }] }],
				},
			],
		};

		await callFlash(autumnV2_2 as FlashClient, payload);

		const after = await ctx.stripeCli.subscriptions.retrieve(sub.id);
		expect(after.status).toBe(before.status);
		expect(after.canceled_at).toBe(before.canceled_at);
		expect(after.cancel_at_period_end).toBe(before.cancel_at_period_end);
		expect(after.items.data[0].current_period_end).toBe(
			before.items.data[0].current_period_end,
		);
	},
);
