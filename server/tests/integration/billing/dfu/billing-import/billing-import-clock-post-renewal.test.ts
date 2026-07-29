/**
 * dfu.flash (test clock) — a monthly sub renews (rolls to its next period)
 * before real now. The imported plan must anchor to the RENEWED period end,
 * never the original first-period end.
 */

import { expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import {
	advanceClock,
	callFlash,
	createRealStripeCustomerOnClock,
	createRealStripeSubOnClock,
	type FlashClient,
	getFlashedCustomerProduct,
	THIRTY_DAYS_MS,
} from "@tests/integration/billing/dfu/billing-import/utils/flashTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("dfu.flash clock: renewed sub anchors to the renewed period, not the original")}`,
	async () => {
		const customerId = "dfu-flash-clock-post-renewal";
		const pro = products.pro({
			id: "dfu-clock-post-renewal-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});

		const day = THIRTY_DAYS_MS / 30;
		// Freeze 40 days back: first period ≈ [-40d, -10d]. Advancing to now crosses
		// the -10d boundary once, so Stripe renews into ≈ [-10d, +20d].
		const frozenTime = Date.now() - day * 40;
		const { customerId: stripeCustomerId, testClockId } =
			await createRealStripeCustomerOnClock(ctx, {
				email: `${customerId}@example.com`,
				frozenTime,
			});
		const { subscriptionId } = await createRealStripeSubOnClock(ctx, {
			customerId: stripeCustomerId,
			label: customerId,
		});
		await advanceClock(ctx, {
			testClockId,
			advanceTo: Date.now(),
			waitForSeconds: 40,
		});

		const sub = await ctx.stripeCli.subscriptions.retrieve(subscriptionId);
		const startMs = sub.start_date * 1000;
		const periodStartMs = sub.items.data[0].current_period_start * 1000;
		const periodEndMs = sub.items.data[0].current_period_end * 1000;
		console.log("post-renewal sub", {
			status: sub.status,
			start: new Date(startMs).toISOString(),
			periodStart: new Date(periodStartMs).toISOString(),
			periodEnd: new Date(periodEndMs).toISOString(),
			now: new Date().toISOString(),
		});

		// The period must have rolled forward: current_period_start is later than the
		// original start, and the current period brackets real now.
		expect(sub.status).toBe("active");
		expect(periodStartMs).toBeGreaterThan(startMs);
		expect(periodStartMs).toBeLessThan(Date.now());
		expect(periodEndMs).toBeGreaterThan(Date.now());

		await callFlash(autumnV2_2 as FlashClient, {
			customer_id: customerId,
			processors: [{ type: "stripe", id: stripeCustomerId }],
			billables: [
				{
					processor: "stripe",
					link: { subscription_id: subscriptionId },
					phases: [{ starts_at: "now", plans: [{ plan_id: pro.id }] }],
				},
			],
		});

		const cusProduct = await getFlashedCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});

		expect(cusProduct?.status).toBe(CusProductStatus.Active);
		// Start is still the sub's original start; the anchor is the RENEWED period end.
		expect(cusProduct?.starts_at).toBe(startMs);
		expect(cusProduct?.billing_cycle_anchor).toBe(periodEndMs);

		const messagesEnt = cusProduct?.customer_entitlements.find(
			(ent) => ent.feature_id === TestFeature.Messages,
		);
		expect(messagesEnt?.next_reset_at).toBe(periodEndMs);
	},
);
