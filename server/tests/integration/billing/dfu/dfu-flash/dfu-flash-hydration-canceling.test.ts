/**
 * dfu.flash hydration — omitted status hydrated from a canceling Stripe sub:
 * cancel_at_period_end → still active, canceled=true, ended_at in the future.
 */

import { expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import { createStripeSubscriptionFromProduct } from "@tests/integration/billing/sync/utils/syncTestUtils.js";
import {
	type FlashClient,
	callFlash,
	getFlashedCustomerProduct,
} from "@tests/integration/billing/dfu/dfu-flash/utils/flashTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("dfu.flash: omitted status hydrated from canceling Stripe sub")}`,
	async () => {
		const customerId = "dfu-flash-hydrate-status";
		const pro = products.pro({
			id: "dfu-hydrate-status-pro",
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
		await ctx.stripeCli.subscriptions.update(sub.id, {
			cancel_at_period_end: true,
		});

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

		const cusProduct = await getFlashedCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		// Canceling-at-period-end: still active, canceled=true, ended_at in the future.
		expect(cusProduct?.status).toBe(CusProductStatus.Active);
		expect(cusProduct?.canceled).toBe(true);
		expect(cusProduct?.ended_at ?? 0).toBeGreaterThan(Date.now());
	},
);
