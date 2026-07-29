/**
 * TDD test for persisting a `subscriptions` row on customer.subscription.created.
 *
 * Contract under test:
 *   New behaviors:
 *     - known customer + external sub, auto-sync skips (no product match)
 *       -> subscriptions row exists with org/env/periods/anchor
 *     - unknown Stripe customer -> NO row (no auto-provisioning)
 *     - auto-sync runs (matched product) -> exactly one row (idempotent with
 *       syncV2's own upsertSubscription)
 *     - attach-created sub (row already written by the attach flow) -> still
 *       exactly one row (upsertByStripeId updates, never duplicates)
 *   Side effects:
 *     - upsertSubscriptionRow runs LAST in the handler and rethrows TRANSIENT
 *       DB errors, so a lost row fails the webhook and rides replay / Stripe
 *       redelivery; deterministic errors log without looping the replay.
 *       Not fault-injectable here; enforced by structure.
 *
 * Pre-impl red: handleStripeSubscriptionCreated never wrote to the
 * subscriptions table itself; rows only appeared when syncV2 executed.
 * Post-impl green: the upsertSubscriptionRow step saves the row for every
 * known customer's subscription.
 */

import { expect, test } from "bun:test";
import { createStripeSubscriptionFromProduct } from "@tests/integration/billing/sync/utils/syncTestUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { SubService } from "@/internal/subscriptions/SubService";

test(`${chalk.yellowBright("sub-created row 1: saves subscriptions row even when auto-sync skips")}`, async () => {
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

	// ── Contract: row exists with correct org/env/periods/anchor ───────────
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

test(`${chalk.yellowBright("sub-created row 2: no row for unknown Stripe customer")}`, async () => {
	const stripeCustomer = await ctx.stripeCli.customers.create({
		email: "sub-created-subscription-row-unknown@example.com",
	});
	const stripeProduct = await ctx.stripeCli.products.create({
		name: "Sub Created Subscription Row Unknown Customer",
	});
	const stripeSubscription = await ctx.stripeCli.subscriptions.create({
		customer: stripeCustomer.id,
		items: [
			{
				price_data: {
					currency: "usd",
					product: stripeProduct.id,
					recurring: { interval: "month" },
					unit_amount: 4242,
				},
			},
		],
		payment_behavior: "default_incomplete",
	});

	await timeout(10000);

	// ── Contract: unknown customer -> no auto-provisioned row ──────────────
	const subscriptionRow = await SubService.getByStripeId({
		db: ctx.db,
		stripeId: stripeSubscription.id,
	});
	expect(subscriptionRow).toBeUndefined();
});

test(`${chalk.yellowBright("sub-created row 3: exactly one row when auto-sync runs")}`, async () => {
	const customerId = "sub-created-subscription-row-synced";

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

	const stripeSubscription = await createStripeSubscriptionFromProduct({
		ctx,
		customerId,
		productId: pro.id,
	});

	await timeout(10000);

	// ── Contract: idempotent with syncV2's upsert — exactly one row ────────
	const subscriptionRows = await SubService.getInStripeIds({
		db: ctx.db,
		ids: [stripeSubscription.id],
	});
	expect(subscriptionRows.length).toBe(1);
	expect(subscriptionRows[0].current_period_start).toBeGreaterThan(0);
});

test(`${chalk.yellowBright("sub-created row 4: attach-created sub keeps exactly one row")}`, async () => {
	const customerId = "sub-created-subscription-row-attach";

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
		actions: [s.attach({ productId: pro.id })],
	});

	await timeout(10000);

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withSubs: true,
	});
	const customerProduct = fullCustomer.customer_products.find(
		(product) => product.product_id === pro.id,
	);
	const stripeSubscriptionId = customerProduct?.subscription_ids?.[0];
	if (!stripeSubscriptionId) {
		throw new Error(`Customer ${customerId} has no attached subscription`);
	}

	// ── Contract: attach row updated, never duplicated ─────────────────────
	const subscriptionRows = await SubService.getInStripeIds({
		db: ctx.db,
		ids: [stripeSubscriptionId],
	});
	expect(subscriptionRows.length).toBe(1);
	expect(subscriptionRows[0].current_period_start).toBeGreaterThan(0);
	expect(subscriptionRows[0].current_period_end).toBeGreaterThan(
		subscriptionRows[0].current_period_start ?? 0,
	);
});
