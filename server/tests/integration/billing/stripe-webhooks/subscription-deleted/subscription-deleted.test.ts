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
 * - Void open invoices when org config enabled (void_invoices_on_subscription_deletion)
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, ApiVersion } from "@autumn/shared";
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
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli";
import { attachFailedPaymentMethod } from "@/external/stripe/stripeCusUtils";
import { CusService } from "@/internal/customers/CusService";
import { OrgService } from "@/internal/orgs/OrgService";
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
		cancel_action: "cancel_end_of_cycle",
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

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Void open invoices when subscription cancelled after payment failure
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Init pro ($20/mo) and free (default) products
 * - Attach pro to customer with successful payment
 * - Switch to a failing payment method
 * - Advance test clock to next billing cycle (payment fails, invoice goes to 'open')
 * - Cancel subscription via Stripe (simulating Stripe's eventual cancellation via dunning)
 *
 * Expected Result:
 * - Open invoices from the failed payment are voided by our webhook handler
 * - Pro is removed
 * - Free default becomes active
 *
 * This tests the void_invoices_on_subscription_deletion org config feature.
 * Note: Stripe doesn't auto-cancel subscriptions on payment failure - it marks them as
 * past_due. This test simulates what happens when the subscription is eventually cancelled
 * (either by Stripe's dunning rules, or manually) and verifies open invoices are voided.
 */
test(`${chalk.yellowBright("sub.deleted: void open invoices on subscription cancel after payment failure")}`, async () => {
	const customerId = "sub-deleted-void-invoices";

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

	// Initialize scenario with test clock enabled
	const { ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Save original org config and enable void_invoices_on_subscription_deletion
	// This must be set in the database because webhooks read config from DB, not request headers
	const originalOrgConfig = ctx.org.config;
	await OrgService.update({
		db: ctx.db,
		orgId: ctx.org.id,
		updates: {
			config: {
				...ctx.org.config,
				void_invoices_on_subscription_deletion: true,
			},
		},
	});

	try {
		const autumnV1 = new AutumnInt({
			version: ApiVersion.V1_2,
			secretKey: ctx.orgSecretKey,
		});

		// Verify pro is active after initial attach
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

		// Get the customer record to access Stripe customer ID
		const customer = await CusService.get({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		// Switch to a failing payment method
		await attachFailedPaymentMethod({
			stripeCli: ctx.stripeCli,
			customer: customer!,
		});

		// Get the failing payment method and set it on the subscription
		// (subscription has its own default_payment_method which takes precedence over customer's)
		const paymentMethods = await ctx.stripeCli.paymentMethods.list({
			customer: customer!.processor?.id,
		});
		const failingPaymentMethod = paymentMethods.data[0];

		await ctx.stripeCli.subscriptions.update(subscriptionId, {
			default_payment_method: failingPaymentMethod.id,
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		// Verify that an open invoice exists (payment failed)
		const invoicesBeforeCancel = await ctx.stripeCli.invoices.list({
			customer: customer!.processor?.id,
			subscription: subscriptionId,
		});

		const openInvoicesBeforeCancel = invoicesBeforeCancel.data.filter(
			(inv) => inv.status === "open",
		);
		expect(openInvoicesBeforeCancel.length).toBeGreaterThan(0);

		// Cancel subscription via Stripe (simulating Stripe's eventual cancellation via dunning)
		// This triggers subscription.deleted webhook which should void open invoices
		await ctx.stripeCli.subscriptions.cancel(subscriptionId);

		// Wait for webhook to process
		await timeout(8000);

		// Verify that open invoices are now voided
		const invoicesAfterCancel = await ctx.stripeCli.invoices.list({
			customer: customer!.processor?.id,
			subscription: subscriptionId,
		});

		// Check that there are no 'open' invoices remaining (they should be voided)
		const openInvoicesAfterCancel = invoicesAfterCancel.data.filter(
			(inv) => inv.status === "open",
		);
		expect(openInvoicesAfterCancel.length).toBe(0);

		// Verify voided invoices exist (proving voiding happened)
		const voidedInvoices = invoicesAfterCancel.data.filter(
			(inv) => inv.status === "void",
		);
		expect(voidedInvoices.length).toBeGreaterThan(0);

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
	} finally {
		// Restore original org config
		await OrgService.update({
			db: ctx.db,
			orgId: ctx.org.id,
			updates: {
				config: originalOrgConfig,
			},
		});
	}
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Verify invoices are NOT voided when config is disabled
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Init pro ($20/mo) and free (default) products
 * - Attach pro to customer with successful payment
 * - Switch to a failing payment method
 * - Advance test clock to next billing cycle (payment fails, invoice goes to 'open')
 * - Cancel subscription via Stripe
 * - Config void_invoices_on_subscription_deletion is FALSE (default)
 *
 * Expected Result:
 * - Open invoice remains 'open' (NOT voided)
 * - Pro is removed
 * - Free default becomes active
 *
 * This is a negative test to verify the feature is correctly gated by the config flag.
 */
test(`${chalk.yellowBright("sub.deleted: open invoices NOT voided when config disabled")}`, async () => {
	const customerId = "sub-deleted-void-disabled";

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

	// Initialize scenario with test clock enabled
	// NOTE: We do NOT enable void_invoices_on_subscription_deletion (default is false)
	const { ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const autumnV1 = new AutumnInt({
		version: ApiVersion.V1_2,
		secretKey: ctx.orgSecretKey,
	});

	// Verify pro is active after initial attach
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

	// Get the customer record to access Stripe customer ID
	const customer = await CusService.get({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	// Switch to a failing payment method
	await attachFailedPaymentMethod({
		stripeCli: ctx.stripeCli,
		customer: customer!,
	});

	// Get the failing payment method and set it on the subscription
	const paymentMethods = await ctx.stripeCli.paymentMethods.list({
		customer: customer!.processor?.id,
	});
	const failingPaymentMethod = paymentMethods.data[0];

	await ctx.stripeCli.subscriptions.update(subscriptionId, {
		default_payment_method: failingPaymentMethod.id,
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Wait for Stripe to process the billing and payment attempt
	await timeout(4000);

	// Verify that an open invoice exists (payment failed)
	const invoicesBeforeCancel = await ctx.stripeCli.invoices.list({
		customer: customer!.processor?.id,
		subscription: subscriptionId,
	});

	const openInvoicesBeforeCancel = invoicesBeforeCancel.data.filter(
		(inv) => inv.status === "open",
	);
	expect(openInvoicesBeforeCancel.length).toBeGreaterThan(0);

	// Cancel subscription via Stripe
	await ctx.stripeCli.subscriptions.cancel(subscriptionId);

	// Wait for webhook to process
	await timeout(8000);

	// Verify that open invoices are still open (NOT voided, because config is disabled)
	const invoicesAfterCancel = await ctx.stripeCli.invoices.list({
		customer: customer!.processor?.id,
		subscription: subscriptionId,
	});

	const openInvoicesAfterCancel = invoicesAfterCancel.data.filter(
		(inv) => inv.status === "open",
	);
	expect(openInvoicesAfterCancel.length).toBeGreaterThan(0);

	// Verify NO voided invoices (feature is disabled)
	const voidedInvoices = invoicesAfterCancel.data.filter(
		(inv) => inv.status === "void",
	);
	expect(voidedInvoices.length).toBe(0);

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
// TEST 7: Only open invoices are voided (paid invoices unchanged)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Init pro ($20/mo) and free (default) products
 * - Attach pro to customer with successful payment (1st invoice paid)
 * - Switch to a failing payment method
 * - Advance test clock to next billing cycle (payment fails, invoice goes to 'open')
 * - Cancel subscription via Stripe
 * - Config void_invoices_on_subscription_deletion is TRUE
 *
 * Expected Result:
 * - Open invoice is voided
 * - Paid invoice remains paid (unchanged)
 * - Exactly 1 voided invoice, exactly 1 paid invoice, 0 open invoices
 *
 * This verifies the feature only voids 'open' invoices, not all invoices.
 */
test(`${chalk.yellowBright("sub.deleted: only open invoices voided, paid invoices unchanged")}`, async () => {
	const customerId = "sub-deleted-void-multiple";

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

	// Initialize scenario with test clock enabled
	const { ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Save original org config and enable void_invoices_on_subscription_deletion
	const originalOrgConfig = ctx.org.config;
	await OrgService.update({
		db: ctx.db,
		orgId: ctx.org.id,
		updates: {
			config: {
				...ctx.org.config,
				void_invoices_on_subscription_deletion: true,
			},
		},
	});

	try {
		const autumnV1 = new AutumnInt({
			version: ApiVersion.V1_2,
			secretKey: ctx.orgSecretKey,
		});

		// Verify pro is active after initial attach (1st invoice is paid)
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

		// Get the customer record to access Stripe customer ID
		const customer = await CusService.get({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		// Verify we have 1 paid invoice from the initial subscription
		const invoicesAfterAttach = await ctx.stripeCli.invoices.list({
			customer: customer!.processor?.id,
			subscription: subscriptionId,
		});
		const paidInvoicesInitial = invoicesAfterAttach.data.filter(
			(inv) => inv.status === "paid",
		);
		expect(paidInvoicesInitial.length).toBe(1);

		// Switch to a failing payment method
		await attachFailedPaymentMethod({
			stripeCli: ctx.stripeCli,
			customer: customer!,
		});

		// Get the failing payment method and set it on the subscription
		const paymentMethods = await ctx.stripeCli.paymentMethods.list({
			customer: customer!.processor?.id,
		});
		const failingPaymentMethod = paymentMethods.data[0];

		await ctx.stripeCli.subscriptions.update(subscriptionId, {
			default_payment_method: failingPaymentMethod.id,
		});

		// Advance to next billing cycle - payment will fail, creating an open invoice
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		// Wait for Stripe to process the billing and payment attempt
		await timeout(4000);

		// Verify invoice statuses before cancellation: 1 paid, 1 open
		const invoicesBeforeCancel = await ctx.stripeCli.invoices.list({
			customer: customer!.processor?.id,
			subscription: subscriptionId,
		});

		const paidBeforeCancel = invoicesBeforeCancel.data.filter(
			(inv) => inv.status === "paid",
		);
		const openBeforeCancel = invoicesBeforeCancel.data.filter(
			(inv) => inv.status === "open",
		);

		expect(paidBeforeCancel.length).toBe(1);
		expect(openBeforeCancel.length).toBe(1);

		// Cancel subscription via Stripe
		await ctx.stripeCli.subscriptions.cancel(subscriptionId);

		// Wait for webhook to process
		await timeout(8000);

		// Verify invoice statuses after cancellation
		const invoicesAfterCancel = await ctx.stripeCli.invoices.list({
			customer: customer!.processor?.id,
			subscription: subscriptionId,
		});

		const paidAfterCancel = invoicesAfterCancel.data.filter(
			(inv) => inv.status === "paid",
		);
		const openAfterCancel = invoicesAfterCancel.data.filter(
			(inv) => inv.status === "open",
		);
		const voidedAfterCancel = invoicesAfterCancel.data.filter(
			(inv) => inv.status === "void",
		);

		// Exactly 1 paid invoice (unchanged)
		expect(paidAfterCancel.length).toBe(1);

		// Exactly 0 open invoices (all voided)
		expect(openAfterCancel.length).toBe(0);

		// Exactly 1 voided invoice
		expect(voidedAfterCancel.length).toBe(1);

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
	} finally {
		// Restore original org config
		await OrgService.update({
			db: ctx.db,
			orgId: ctx.org.id,
			updates: {
				config: originalOrgConfig,
			},
		});
	}
});
