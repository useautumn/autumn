/**
 * dfu.flash — payload status precedence: an explicit payload status wins over the
 * hydrated Stripe status. Fully e2e (real sub, real cancel, real flash).
 *
 * We assert the flash RESPONSE (`flashed[].status`) — the resolver's decision
 * returned by the endpoint at compute time. The post-flash DB status is NOT
 * asserted here: canceling a linked sub fires a customer.subscription.deleted
 * webhook that legitimately reconciles the cusProduct to expired, which is
 * inherent live-reconciliation racing the read, not a flash bug.
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
	`${chalk.yellowBright("dfu.flash: payload status wins over hydrated Stripe status")}`,
	async () => {
		const customerId = "dfu-flash-hydrate-precedence";
		const pro = products.pro({
			id: "dfu-hydrate-precedence-pro",
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
		// Fully cancel: hydrated status would be Expired.
		await ctx.stripeCli.subscriptions.cancel(sub.id);

		const payload = {
			customer_id: customerId,
			processors: [{ type: "stripe", id: sub.customer as string }],
			billables: [
				{
					processor: "stripe",
					link: { subscription_id: sub.id },
					phases: [
						{
							starts_at: "now",
							plans: [{ plan_id: pro.id, status: "active" }],
						},
					],
				},
			],
		};

		const flashRes = await callFlash(autumnV2_2 as FlashClient, payload);

		// Payload said active -> resolver reports active, despite hydrated Expired.
		const flashed = flashRes.result?.flashed?.find((f) => f.plan_id === pro.id);
		expect(flashed?.status).toBe("active");
	},
);
