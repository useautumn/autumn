/**
 * Cancel End of Cycle Tests
 *
 * Tests for the `cancel: 'end_of_cycle'` parameter in update subscription.
 * This cancels a subscription at the end of the current billing period.
 *
 * Key behaviors:
 * - Product remains active until cycle end
 * - Default product (if exists) is scheduled to start at cycle end
 * - Stripe subscription is set to cancel at period end
 * - After cycle end, product is removed and default (if any) becomes active
 */

import { expect, test } from "bun:test";
import { type ApiCustomer, type ApiCustomerV3, ms } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Cancel end of cycle with default free product
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User is on Pro (paid product, $20/mo)
 * - Free default product exists
 * - User cancels Pro at end of cycle
 *
 * Expected Result:
 * - Pro should be canceling (active with canceled_at set)
 * - Free default should be scheduled
 * - Stripe subscription should be set to cancel at period end
 * - After advancing to next invoice, Pro is gone and Free is active
 */
test.concurrent(`${chalk.yellowBright("cancel end of cycle: with default free product")}`, async () => {
	const customerId = "cancel-eoc-with-default";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	// Free is the default product (products.base has no base price = free)
	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro], customerIdsToDelete: [customerId] }),
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

	// Cancel pro at end of cycle
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

	// Verify Stripe subscription is set to cancel at period end
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: true,
	});

	// Initial attach invoice
	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 1,
		latestTotal: 20, // Pro $20/mo
	});

	// Advance to next invoice (next billing cycle)
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// After advancing, pro should be gone and free should be active
	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductNotPresent({
		customer: customerAfterAdvance,
		productId: pro.id,
	});

	await expectProductActive({
		customer: customerAfterAdvance,
		productId: free.id,
	});

	// Verify no Stripe subscription exists after cycle end (free has no price)
	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Cancel end of cycle without default product
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User is on Pro (paid product, $20/mo)
 * - NO default product exists
 * - User cancels Pro at end of cycle
 *
 * Expected Result:
 * - Pro should be canceling (active with canceled_at set)
 * - No scheduled product
 * - Stripe subscription should be set to cancel at period end
 * - After advancing to next invoice, Pro is gone, no products attached
 */
test.concurrent(`${chalk.yellowBright("cancel end of cycle: no default product")}`, async () => {
	const customerId = "cancel-eoc-no-default";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	// Pro is the only product (not default)
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
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

	// Cancel pro at end of cycle
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_end_of_cycle",
	});

	// Verify pro is canceling
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: pro.id,
	});

	// Verify Stripe subscription is set to cancel at period end
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: true,
	});

	// Initial attach invoice
	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 1,
		latestTotal: 20, // Pro $20/mo
	});

	// Advance to next invoice (next billing cycle)
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// After advancing, pro should be gone with no products attached
	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductNotPresent({
		customer: customerAfterAdvance,
		productId: pro.id,
	});

	// No products should be attached
	expect(customerAfterAdvance.products.length).toBe(0);

	// Verify no Stripe subscription exists after cycle end
	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Downgrade then cancel end of cycle (with default)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User is on Premium ($50/mo)
 * - User downgrades to Pro ($20/mo) → Premium is canceling, Pro is scheduled
 * - User cancels Premium at end of cycle
 *
 * Expected Result:
 * - Premium is still canceling
 * - Pro scheduled product should be REMOVED
 * - Free default should be scheduled instead
 * - Stripe subscription is set to cancel at period end
 *
 * This tests the case where cancel_end_of_cycle deletes an existing scheduled product.
 *
 * Reference: cancel6.test.ts (migrated)
 */
test.concurrent(`${chalk.yellowBright("cancel end of cycle: downgrade then cancel (with default)")}`, async () => {
	const customerId = "cancel-eoc-downgrade-default";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	// Free is the default product (products.base has no base price = free)
	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	// Pro product ($20/mo)
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	// Premium product ($50/mo) - use products.base with custom price
	const premiumPriceItem = items.monthlyPrice({ price: 50 });
	const premium = products.base({
		id: "premium",
		items: [messagesItem, premiumPriceItem],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
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

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const stripeCustomerId = customer.stripe_id;
	const subs = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomerId!,
	});
	expect(subs.data.length).toBe(1);

	const sub = subs.data[0];

	// When a subscription is managed by a schedule, the schedule handles cancellation
	// The subscription itself should NOT have cancel_at set (schedule manages lifecycle)
	expect(sub.schedule).not.toBeNull();

	// Cancel premium at end of cycle
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: premium.id,
		cancel_action: "cancel_end_of_cycle",
	});

	// Verify state after cancel
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterCancel,
		canceling: [premium.id],
		notPresent: [pro.id],
		scheduled: [free.id],
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: true,
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterAdvance,
		active: [free.id],
		notPresent: [premium.id],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Downgrade then cancel end of cycle (no default)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User is on Premium ($50/mo)
 * - User downgrades to Pro ($20/mo) → Premium is canceling, Pro is scheduled
 * - User cancels Premium at end of cycle
 * - NO default product exists
 *
 * Expected Result:
 * - Premium is still canceling
 * - Pro scheduled product should be REMOVED
 * - No product scheduled (no default)
 * - Stripe subscription is set to cancel at period end
 */
test.concurrent(`${chalk.yellowBright("cancel end of cycle: downgrade then cancel (no default)")}`, async () => {
	const customerId = "cancel-eoc-downgrade-no-default";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	// Pro product ($20/mo) - NOT default
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	// Premium product ($50/mo) - use products.base with custom price
	const premiumPriceItem = items.monthlyPrice({ price: 50 });
	const premium = products.base({
		id: "premium",
		items: [messagesItem, premiumPriceItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.attach({ productId: premium.id }),
			s.attach({ productId: pro.id }), // Downgrade: premium canceling, pro scheduled
		],
	});

	// Cancel premium at end of cycle
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: premium.id,
		cancel_action: "cancel_end_of_cycle",
	});

	// Verify state after cancel
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterCancel,
		canceling: [premium.id],
		notPresent: [pro.id],
	});

	// No products should be scheduled (no default product)
	const scheduledProducts = customerAfterCancel.products.filter(
		(p) => p.status === "scheduled",
	);
	expect(scheduledProducts.length).toBe(0);

	// Verify Stripe subscription is set to cancel at period end
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: true,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Cancel end of cycle for multi-interval product
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User is on Pro with monthly messages + annual base price (multi-interval)
 * - User cancels Pro at end of cycle
 *
 * Expected Result:
 * - Pro should be canceling
 * - expires_at from V2 API should be at the end of the annual period (longest interval)
 * - Stripe subscription should be set to cancel at period end
 */
test.concurrent(`${chalk.yellowBright("cancel end of cycle: multi-interval product (monthly + annual)")}`, async () => {
	const customerId = "cancel-eoc-multi-interval";

	// Multi-interval product: monthly messages + annual base price
	const messagesItem = items.prepaidMessages({ includedUsage: 0 });
	const annualPriceItem = items.annualPrice({ price: 200 }); // $200/year

	const pro = products.base({
		id: "pro",
		items: [messagesItem, annualPriceItem],
	});

	const free = products.base({
		id: "free",
		items: [items.dashboard()],
		isDefault: true,
	});

	const { autumnV1, autumnV2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	// Verify pro is active
	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterAttach,
		productId: pro.id,
	});

	// Cancel pro at end of cycle
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_end_of_cycle",
	});

	// Verify pro is canceling
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: pro.id,
	});

	// Get customer via V2 API to check expires_at
	const customerV2 = await autumnV2.customers.get<ApiCustomer>(customerId);

	// Find the pro subscription
	const proSubscription = customerV2.subscriptions.find(
		(sub) => sub.plan_id === pro.id,
	);
	expect(proSubscription).toBeDefined();

	// expires_at should be set (at end of annual period since that's the longest interval)
	expect(proSubscription!.expires_at).not.toBeNull();
	expect(proSubscription!.canceled_at).not.toBeNull();

	// expires_at should be approximately 1 year from now (annual interval)
	// Allow some tolerance for test execution time
	const now = Date.now();
	const oneYearFromNow = now + ms.days(365);
	const tolerance = ms.hours(1); // 1 hour tolerance

	expect(proSubscription!.expires_at!).toBeWithin(
		oneYearFromNow - tolerance,
		oneYearFromNow + tolerance,
	);

	// Verify Stripe subscription is set to cancel at period end
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: true,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Cancel end of cycle then cancel immediately
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User is on Pro ($20/mo)
 * - Free default product exists
 * - User cancels Pro at end of cycle (Pro becomes canceling, Free is scheduled)
 * - User then cancels Pro immediately
 *
 * Expected Result:
 * - Pro is removed immediately (not waiting for cycle end)
 * - Free default becomes active immediately
 * - Stripe subscription is canceled
 */
test.concurrent(`${chalk.yellowBright("cancel end of cycle: then cancel immediately")}`, async () => {
	const customerId = "cancel-eoc-then-imm";

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

	// Step 1: Cancel pro at end of cycle
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_end_of_cycle",
	});

	// Verify pro is canceling and free is scheduled
	const customerAfterEocCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductCanceling({
		customer: customerAfterEocCancel,
		productId: pro.id,
	});

	await expectProductScheduled({
		customer: customerAfterEocCancel,
		productId: free.id,
	});

	// Verify Stripe subscription is set to cancel at period end
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: true,
	});

	// Step 2: Now cancel pro immediately (override the end_of_cycle cancel)
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_immediately",
	});

	// Verify pro is gone and free is active immediately
	const customerAfterImmCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterImmCancel,
		notPresent: [pro.id],
		active: [free.id],
	});

	// Verify Stripe subscription is canceled (not just set to cancel at period end)
	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
