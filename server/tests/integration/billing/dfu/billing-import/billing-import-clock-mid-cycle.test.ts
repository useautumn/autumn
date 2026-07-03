/**
 * dfu.flash (test clock) — a monthly sub sits mid-cycle at real now. The
 * imported plan must keep the sub's real start (past) and anchor its cycle to
 * the sub's real current_period_end (future), never drifting to import time.
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
	`${chalk.yellowBright("dfu.flash clock: mid-cycle sub anchors to the real period end, not import time")}`,
	async () => {
		const customerId = "dfu-flash-clock-mid-cycle";
		const pro = products.pro({
			id: "dfu-clock-mid-cycle-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});

		// Freeze 15 days in the past, create the sub, then advance to ≈ real now so
		// the first monthly period brackets Date.now().
		const frozenTime = Date.now() - THIRTY_DAYS_MS / 2;
		const { customerId: stripeCustomerId, testClockId } =
			await createRealStripeCustomerOnClock(ctx, {
				email: `${customerId}@example.com`,
				frozenTime,
			});
		const { subscriptionId } = await createRealStripeSubOnClock(ctx, {
			customerId: stripeCustomerId,
			label: customerId,
		});
		await advanceClock(ctx, { testClockId, advanceTo: Date.now() });

		const sub = await ctx.stripeCli.subscriptions.retrieve(subscriptionId);
		const startMs = sub.start_date * 1000;
		const periodStartMs = sub.items.data[0].current_period_start * 1000;
		const periodEndMs = sub.items.data[0].current_period_end * 1000;
		console.log("mid-cycle sub", {
			status: sub.status,
			start: new Date(startMs).toISOString(),
			periodStart: new Date(periodStartMs).toISOString(),
			periodEnd: new Date(periodEndMs).toISOString(),
			now: new Date().toISOString(),
		});

		// Empirically confirm the period brackets real now (the flash's import now).
		expect(sub.status).toBe("active");
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
		// Start is the sub's real (past) start, not import time.
		expect(cusProduct?.starts_at).toBe(startMs);
		// Cycle anchor is the real future period end, not import + 1 month.
		expect(cusProduct?.billing_cycle_anchor).toBe(periodEndMs);
		expect(cusProduct?.starts_at).toBeLessThan(Date.now());
		expect(cusProduct?.billing_cycle_anchor).toBeGreaterThan(Date.now());

		const messagesEnt = cusProduct?.customer_entitlements.find(
			(ent) => ent.feature_id === TestFeature.Messages,
		);
		expect(messagesEnt?.next_reset_at).toBe(periodEndMs);
	},
);
