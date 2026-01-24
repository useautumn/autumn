/**
 * Subscription Updated Webhook - Uncancel Tests
 *
 * Tests for handling the `customer.subscription.updated` Stripe webhook event
 * when a subscription's cancel_at_period_end is set to false (uncancel/renew).
 *
 * These tests simulate uncanceling subscriptions directly through the Stripe client
 * (not through Autumn's uncancel API) to verify the webhook handler works correctly.
 *
 * The webhook handler should:
 * - Remove canceled_at from customer products
 * - Remove scheduled default products
 * - Mark the subscription as no longer canceling
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import {
	expectCustomerProducts,
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { timeout } from "@/utils/genUtils";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Uncancel via Stripe CLI (cancel_at_period_end: false)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Init pro ($20/mo) and free (default) products
 * - Attach pro to customer
 * - Cancel pro via Autumn API (end_of_cycle) - Pro is canceling, Free is scheduled
 * - Uncancel via Stripe CLI (cancel_at_period_end: false)
 *
 * Expected Result:
 * - Pro is active (no longer canceling)
 * - Free scheduled product is removed
 * - Only pro remains in customer products
 */
test.concurrent(`${chalk.yellowBright("sub.updated: uncancel via Stripe CLI (cancel_at_period_end: false)")}`, async () => {
	const customerId = "sub-updated-uncancel-basic";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Verify pro is active
	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterAttach,
		productId: pro.id,
	});

	// Cancel pro at end of cycle via Autumn API
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_end_of_cycle",
	});

	// Verify pro is canceling and free is scheduled
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: pro.id,
	});
	await expectProductScheduled({
		customer: customerAfterCancel,
		productId: free.id,
	});

	// Get subscription ID
	const subscriptionId = await getSubscriptionId({
		ctx,
		customerId,
		productId: pro.id,
	});

	// Uncancel via Stripe CLI (simulating external renewal)
	await ctx.stripeCli.subscriptions.update(subscriptionId, {
		// cancel_at_period_end: false,
		cancel_at: null,
	});

	// Wait for webhook to process
	await timeout(8000);

	// Verify pro is active (no longer canceling)
	const customerAfterUncancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer: customerAfterUncancel,
		productId: pro.id,
	});

	// Verify free scheduled product is removed
	await expectProductNotPresent({
		customer: customerAfterUncancel,
		productId: free.id,
	});

	// Verify only 1 product in customer's group
	const productsInGroup = customerAfterUncancel.products.filter(
		(p) => p.group === pro.group,
	);
	expect(productsInGroup.length).toBe(1);
	expect(productsInGroup[0].id).toBe(pro.id);

	// Verify subscription is not canceling
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Uncancel pro with add-on via Stripe CLI
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Init pro ($20/mo), free (default), and recurring add-on ($20/mo) products
 * - Attach pro and add-on to customer
 * - Cancel pro via Autumn API (end_of_cycle) - Pro is canceling, Free is scheduled
 * - Uncancel via Stripe CLI (cancel_at_period_end: false)
 *
 * Expected Result:
 * - Pro is active (no longer canceling)
 * - Add-on remains active
 * - Free scheduled product is removed
 */
test.concurrent(`${chalk.yellowBright("sub.updated: uncancel pro with add-on via Stripe CLI")}`, async () => {
	const customerId = "sub-updated-uncancel-addon";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const addon = products.recurringAddOn({
		id: "addon",
		items: [items.monthlyMessages({ includedUsage: 300 })],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro, addon] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attach({ productId: addon.id }),
		],
	});

	// Verify pro and add-on are active
	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerAfterAttach,
		active: [pro.id, addon.id],
	});

	// Cancel pro at end of cycle via Autumn API
	// await autumnV1.subscriptions.update({
	// 	customer_id: customerId,
	// 	product_id: pro.id,
	// 	cancel_action: "cancel_end_of_cycle",
	// });
	// Get subscription ID
	const subscriptionId = await getSubscriptionId({
		ctx,
		customerId,
		productId: pro.id,
	});

	await ctx.stripeCli.subscriptions.update(subscriptionId, {
		cancel_at_period_end: true,
	});

	await timeout(5000);

	// Verify pro is canceling, addon is active, free is scheduled
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: pro.id,
	});
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: addon.id,
	});
	await expectProductScheduled({
		customer: customerAfterCancel,
		productId: free.id,
	});

	// Uncancel via Stripe CLI (simulating external renewal)
	await ctx.stripeCli.subscriptions.update(subscriptionId, {
		cancel_at_period_end: false,
	});

	// Wait for webhook to process
	await timeout(5000);

	// Verify pro is active (no longer canceling), addon still active
	const customerAfterUncancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterUncancel,
		active: [pro.id, addon.id],
		notPresent: [free.id],
	});

	// Verify subscription is not canceling
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Cancel via Stripe CLI then uncancel via Stripe CLI
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Init pro ($20/mo) and free (default) products
 * - Attach pro to customer
 * - Cancel via Stripe CLI (cancel_at_period_end: true)
 * - Uncancel via Stripe CLI (cancel_at_period_end: false)
 *
 * Expected Result:
 * - After cancel: Pro is canceling, Free is scheduled
 * - After uncancel: Pro is active, Free is removed
 */
test.concurrent(`${chalk.yellowBright("sub.updated: cancel pro then uncancel pro via Stripe CLI")}`, async () => {
	const customerId = "sub-updated-cancel-uncancel-cli";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Verify pro is active
	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterAttach,
		productId: pro.id,
	});

	// Get subscription ID
	const subscriptionId = await getSubscriptionId({
		ctx,
		customerId,
		productId: pro.id,
	});

	// Cancel via Stripe CLI (simulating external cancellation)
	await ctx.stripeCli.subscriptions.update(subscriptionId, {
		cancel_at_period_end: true,
	});

	// Wait for webhook to process
	await timeout(5000);

	// Verify pro is canceling and free is scheduled
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: pro.id,
	});
	await expectProductScheduled({
		customer: customerAfterCancel,
		productId: free.id,
	});

	// Uncancel via Stripe CLI (simulating external renewal)
	await ctx.stripeCli.subscriptions.update(subscriptionId, {
		cancel_at_period_end: false,
	});

	// Wait for webhook to process
	await timeout(5000);

	// Verify pro is active (no longer canceling)
	const customerAfterUncancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer: customerAfterUncancel,
		productId: pro.id,
	});

	// Verify free scheduled product is removed
	await expectProductNotPresent({
		customer: customerAfterUncancel,
		productId: free.id,
	});

	// Verify only 1 product in customer's group
	const productsInGroup = customerAfterUncancel.products.filter(
		(p) => p.group === pro.group,
	);
	expect(productsInGroup.length).toBe(1);
	expect(productsInGroup[0].id).toBe(pro.id);

	// Verify subscription is not canceling
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});
});
