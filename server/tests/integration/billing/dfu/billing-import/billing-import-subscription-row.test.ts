/**
 * billing.import — an imported Stripe sub must persist an Autumn subscription
 * row, so the plan reports its real billing period instead of null.
 */

import { expect, test } from "bun:test";
import {
	callFlash,
	createRealStripeCustomer,
	createRealStripeSub,
	type FlashClient,
} from "@tests/integration/billing/dfu/billing-import/utils/flashTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { SubService } from "@/internal/subscriptions/SubService.js";

test.concurrent(
	`${chalk.yellowBright("billing.import: persists the Stripe subscription's billing period")}`,
	async () => {
		const customerId = "dfu-flash-subscription-row";
		const pro = products.pro({
			id: "dfu-subscription-row-pro",
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
		const { subscriptionId } = await createRealStripeSub(ctx, {
			email: `${customerId}@example.com`,
			customerId: stripeCustomerId,
		});

		const sub = await ctx.stripeCli.subscriptions.retrieve(subscriptionId);
		const periodStart = sub.items.data[0].current_period_start;
		const periodEnd = sub.items.data[0].current_period_end;

		const { result } = await callFlash(autumnV2_2 as FlashClient, {
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

		const autumnSub = await SubService.getByStripeId({
			db: ctx.db,
			stripeId: subscriptionId,
		});

		expect(autumnSub?.current_period_start).toBe(periodStart);
		expect(autumnSub?.current_period_end).toBe(periodEnd);
		expect(autumnSub?.billing_cycle_anchor_seconds).toBe(
			sub.billing_cycle_anchor,
		);

		// The period must surface on the API response, not come back null.
		const apiSubscription = result?.customer?.subscriptions?.find(
			(subscription) => subscription.plan_id === pro.id,
		);
		expect(apiSubscription?.current_period_start).toBe(periodStart * 1000);
		expect(apiSubscription?.current_period_end).toBe(periodEnd * 1000);
	},
);
