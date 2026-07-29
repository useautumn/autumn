/**
 * Regression: sub.created must persist a `subscriptions` row for a known
 * customer even when auto-sync skips (e.g. no product match). sub.updated only
 * patches existing rows, so a missed row means period tracking never lands.
 */

import { expect, test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { SubService } from "@/internal/subscriptions/SubService";

test(`${chalk.yellowBright("customer.subscription.created: saves subscriptions row even when auto-sync skips")}`, async () => {
	const customerId = "sub-created-subscription-row";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	await initScenario({
		customerId,
		ctx,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const stripeCustomerId = fullCustomer.processor?.id;
	if (!stripeCustomerId) {
		throw new Error(`Customer ${customerId} has no Stripe customer ID`);
	}

	const stripeProduct = await ctx.stripeCli.products.create({
		name: "Sub Created Subscription Row No Match",
	});
	const stripeSubscription = await ctx.stripeCli.subscriptions.create({
		customer: stripeCustomerId,
		items: [
			{
				price_data: {
					currency: "usd",
					product: stripeProduct.id,
					recurring: { interval: "month" },
					unit_amount: 5555,
				},
			},
		],
	});

	await timeout(10000);

	// ── Contract: subscriptions row exists for the new stripe sub ──────────
	const subscriptionRow = await SubService.getByStripeId({
		db: ctx.db,
		stripeId: stripeSubscription.id,
	});
	expect(subscriptionRow).toBeDefined();
	expect(subscriptionRow?.org_id).toBe(ctx.org.id);
	expect(subscriptionRow?.env).toBe(ctx.env);
	expect(subscriptionRow?.current_period_start).toBeGreaterThan(0);
	expect(subscriptionRow?.current_period_end).toBeGreaterThan(
		subscriptionRow?.current_period_start ?? 0,
	);
	expect(subscriptionRow?.billing_cycle_anchor_seconds).toBe(
		stripeSubscription.billing_cycle_anchor,
	);
});
