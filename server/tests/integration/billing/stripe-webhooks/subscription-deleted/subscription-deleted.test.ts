/**
 * Customer Subscription Deleted Webhook Tests
 *
 * Tests for handling the `customer.subscription.deleted` Stripe webhook event.
 * These tests simulate canceling subscriptions directly through the Stripe client
 * (not through Autumn's cancel API) to verify the webhook handler works correctly.
 *
 * The webhook handler should:
 * - Expire customer products on the deleted subscription
 * - Activate default products if available
 * - Delete any scheduled products in the same group
 */

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import {
	expectCustomerProducts,
	expectProductActive,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { timeout } from "@/utils/genUtils";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Cancel subscription directly via Stripe (with default free)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Init pro ($20/mo) and free (default) products
 * - Attach pro to customer
 * - Cancel subscription directly via Stripe client
 *
 * Expected Result:
 * - Pro is removed
 * - Free default becomes active
 * - No Stripe subscription exists
 */
test(`${chalk.yellowBright("sub.deleted: cancel active subscription via Stripe (with default)")}`, async () => {
	const customerId = "sub-deleted-basic";

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

	// Get subscription ID from internal customer data
	const subscriptionId = await getSubscriptionId({
		ctx,
		customerId,
		productId: pro.id,
	});

	// Cancel subscription directly via Stripe client (simulating external cancellation)
	await ctx.stripeCli.subscriptions.cancel(subscriptionId);

	// Wait for webhook to process
	await timeout(8000);

	// Verify pro is gone and free is active
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterCancel,
		notPresent: [pro.id],
		active: [free.id],
	});

	// Verify no Stripe subscription exists
	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Cancel subscription after end_of_cycle cancel (via Stripe)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Init pro ($20/mo) and free (default) products
 * - Attach pro to customer
 * - Cancel pro via Autumn API (end_of_cycle) - Pro is canceling, Free is scheduled
 * - Cancel subscription directly via Stripe client (immediate cancellation)
 *
 * Expected Result:
 * - Pro is removed immediately (not waiting for cycle end)
 * - Free default becomes active
 * - No Stripe subscription exists
 */
test(`${chalk.yellowBright("sub.deleted: cancel after end_of_cycle via Stripe")}`, async () => {
	const customerId = "sub-deleted-after-eoc";

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
		cancel: "end_of_cycle",
	});

	// Verify pro is canceling and free is scheduled
	const customerAfterEoc =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterEoc,
		productId: pro.id,
	});
	await expectProductScheduled({
		customer: customerAfterEoc,
		productId: free.id,
	});

	await timeout(3000); // wait for lock to be released

	// Get subscription ID from internal customer data
	const subscriptionId = await getSubscriptionId({
		ctx,
		customerId,
		productId: pro.id,
	});

	// Cancel subscription directly via Stripe client (simulating external immediate cancellation)
	await ctx.stripeCli.subscriptions.cancel(subscriptionId);

	// Wait for webhook to process
	await timeout(8000);

	// Verify pro is gone and free is active
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterCancel,
		notPresent: [pro.id],
		active: [free.id],
	});

	// Verify no Stripe subscription exists
	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Cancel subscription with scheduled downgrade via Stripe
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Init premium ($50/mo), pro ($20/mo), and free (default) products
 * - Attach premium to customer
 * - Attach pro (downgrade) - Premium is canceling, Pro is scheduled
 * - Cancel subscription directly via Stripe client
 *
 * Expected Result:
 * - Premium is removed
 * - Pro scheduled product is also removed (downgrade cancelled)
 * - Free default becomes active
 * - No Stripe subscription exists
 */
test(`${chalk.yellowBright("sub.deleted: cancel with scheduled downgrade via Stripe")}`, async () => {
	const customerId = "sub-deleted-downgrade";

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

	const premiumPriceItem = items.monthlyPrice({ price: 50 });
	const premium = products.base({
		id: "premium",
		items: [messagesItem, premiumPriceItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro, premium] }),
		],
		actions: [
			s.attach({ productId: premium.id }),
			s.attach({ productId: pro.id }), // Downgrade: premium canceling, pro scheduled
		],
	});

	// Verify premium is canceling and pro is scheduled
	const customerAfterDowngrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterDowngrade,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: customerAfterDowngrade,
		productId: pro.id,
	});

	// Get subscription ID from internal customer data (from premium product)
	const subscriptionId = await getSubscriptionId({
		ctx,
		customerId,
		productId: premium.id,
	});

	// Cancel subscription directly via Stripe client
	await ctx.stripeCli.subscriptions.cancel(subscriptionId);

	// Wait for webhook to process
	await timeout(8000);

	// Verify premium and pro are gone, free is active
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterCancel,
		notPresent: [premium.id, pro.id],
		active: [free.id],
	});

	// Verify no Stripe subscription exists
	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Cancel subscription with add-on via Stripe
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Init pro ($20/mo), free (default), and monthly add-on ($10/mo) products
 * - Attach pro to customer
 * - Attach add-on to customer
 * - Cancel the subscription directly via Stripe client
 *
 * Expected Result:
 * - Pro is removed
 * - Add-on is also removed (on same subscription)
 * - Free default becomes active
 * - No Stripe subscription exists
 */
test(`${chalk.yellowBright("sub.deleted: cancel subscription with add-on via Stripe")}`, async () => {
	const customerId = "sub-deleted-addon";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const wordsItem = items.monthlyWords({ includedUsage: 50 });

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
		items: [wordsItem],
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

	// Verify pro and addon are active
	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerAfterAttach,
		active: [pro.id, addon.id],
	});

	// Get subscription ID from internal customer data (from pro product)
	const subscriptionId = await getSubscriptionId({
		ctx,
		customerId,
		productId: pro.id,
	});

	// Cancel subscription directly via Stripe client
	await ctx.stripeCli.subscriptions.cancel(subscriptionId);

	// Wait for webhook to process
	await timeout(8000);

	// Verify pro and addon are gone, free is active
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterCancel,
		notPresent: [pro.id, addon.id],
		active: [free.id],
	});

	// Verify no Stripe subscription exists
	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
