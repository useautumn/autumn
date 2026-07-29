/**
 * dfu.flash (test clock) — a trial converts to active before real now. The
 * imported plan must be Active, its trial_ends_at in the past, and its cycle
 * anchored to the now-current (post-trial) period end.
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
	`${chalk.yellowBright("dfu.flash clock: trial converted to active anchors to the post-trial period")}`,
	async () => {
		const customerId = "dfu-flash-clock-post-trial";
		const pro = products.pro({
			id: "dfu-clock-post-trial-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});

		const day = THIRTY_DAYS_MS / 30;
		// Freeze 20 days back, 10-day trial → trial_end ≈ 10 days ago. Advance mid-
		// trial first, then PAST trial_end (to real now) so it converts to active.
		const frozenTime = Date.now() - day * 20;
		const { customerId: stripeCustomerId, testClockId } =
			await createRealStripeCustomerOnClock(ctx, {
				email: `${customerId}@example.com`,
				frozenTime,
			});
		const { subscriptionId } = await createRealStripeSubOnClock(ctx, {
			customerId: stripeCustomerId,
			label: customerId,
			trialPeriodDays: 10,
		});
		await advanceClock(ctx, { testClockId, advanceTo: Date.now() - day * 15 });
		await advanceClock(ctx, { testClockId, advanceTo: Date.now() });

		const sub = await ctx.stripeCli.subscriptions.retrieve(subscriptionId);
		const trialEndMs = (sub.trial_end ?? 0) * 1000;
		const periodEndMs = sub.items.data[0].current_period_end * 1000;
		console.log("post-trial sub", {
			status: sub.status,
			trialEnd: new Date(trialEndMs).toISOString(),
			periodEnd: new Date(periodEndMs).toISOString(),
			now: new Date().toISOString(),
		});

		// Trial has passed → sub is active; the current period brackets real now.
		expect(sub.status).toBe("active");
		expect(trialEndMs).toBeLessThan(Date.now());
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
		// The trial is over: trial_ends_at is in the past, so it grants no trialing.
		expect(cusProduct?.trial_ends_at).toBeLessThan(Date.now());
		// Cycle anchors to the now-current post-trial period end (future).
		expect(cusProduct?.billing_cycle_anchor).toBe(periodEndMs);

		const messagesEnt = cusProduct?.customer_entitlements.find(
			(ent) => ent.feature_id === TestFeature.Messages,
		);
		expect(messagesEnt?.next_reset_at).toBe(periodEndMs);
	},
);
