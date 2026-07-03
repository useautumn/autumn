/**
 * dfu.flash (test clock) — a sub sits mid-trial at real now. The imported plan
 * must hydrate trial_ends_at from the sub's real (future) trial_end and anchor
 * its cycle to that trial end.
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
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("dfu.flash clock: mid-trial sub hydrates the real future trial_end")}`,
	async () => {
		const customerId = "dfu-flash-clock-mid-trial";
		const pro = products.pro({
			id: "dfu-clock-mid-trial-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});

		// Freeze 7 days back, 14-day trial → trial_end ≈ 7 days future. Advance to
		// real now so the sub is genuinely mid-trial at import time.
		const frozenTime = Date.now() - (THIRTY_DAYS_MS / 30) * 7;
		const { customerId: stripeCustomerId, testClockId } =
			await createRealStripeCustomerOnClock(ctx, {
				email: `${customerId}@example.com`,
				frozenTime,
			});
		const { subscriptionId } = await createRealStripeSubOnClock(ctx, {
			customerId: stripeCustomerId,
			label: customerId,
			trialPeriodDays: 14,
		});
		await advanceClock(ctx, { testClockId, advanceTo: Date.now() });

		const sub = await ctx.stripeCli.subscriptions.retrieve(subscriptionId);
		const trialEndMs = (sub.trial_end ?? 0) * 1000;
		const periodEndMs = sub.items.data[0].current_period_end * 1000;
		console.log("mid-trial sub", {
			status: sub.status,
			trialEnd: new Date(trialEndMs).toISOString(),
			periodEnd: new Date(periodEndMs).toISOString(),
			now: new Date().toISOString(),
		});

		expect(sub.status).toBe("trialing");
		expect(trialEndMs).toBeGreaterThan(Date.now());

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

		// Autumn has no distinct "trialing" cusProduct status; a Stripe trialing sub
		// maps to Active, and the trial is carried by a future trial_ends_at.
		expect(cusProduct?.status).toBe(CusProductStatus.Active);
		expect(cusProduct?.trial_ends_at).toBe(trialEndMs);
		expect(cusProduct?.trial_ends_at).toBeGreaterThan(Date.now());
		expect(cusProduct?.billing_cycle_anchor).toBe(periodEndMs);
	},
);
