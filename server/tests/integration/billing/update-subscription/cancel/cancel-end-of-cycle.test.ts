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
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
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

	// Cancel pro at end of cycle
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel: "end_of_cycle",
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
		cancel: "end_of_cycle",
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
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Cancel end of cycle with custom plan items
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User is on Pro ($20/mo, 100 messages)
 * - User updates to custom plan (200 messages, $30/mo) AND cancels at end of cycle
 *
 * Expected Result:
 * - New custom plan is attached and is canceling
 * - Stripe subscription is updated with new items and set to cancel at period end
 * - Invoice for the prorated difference
 */
test.concurrent(`${chalk.yellowBright("cancel end of cycle: with custom plan items")}`, async () => {
	const customerId = "cancel-eoc-custom-plan";

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

	// Update to custom plan items AND cancel at end of cycle
	const updatedMessagesItem = items.monthlyMessages({ includedUsage: 200 });
	const newPriceItem = items.monthlyPrice({ price: 30 }); // $30/mo instead of $20

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [updatedMessagesItem, newPriceItem],
		cancel: "end_of_cycle" as const,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should charge prorated difference for price increase
	console.log("Preview total (cancel + custom plan):", preview.total);

	await autumnV1.subscriptions.update(updateParams);

	// Verify pro is canceling (with custom configuration)
	const customerAfterUpdate =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductCanceling({
		customer: customerAfterUpdate,
		productId: pro.id,
	});

	// Free should be scheduled
	await expectProductScheduled({
		customer: customerAfterUpdate,
		productId: free.id,
	});

	// Verify Stripe subscription is correct (still set to cancel at period end)
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: true,
	});

	// Verify invoices - initial attach + update
	expectCustomerInvoiceCorrect({
		customer: customerAfterUpdate,
		count: 2,
		latestTotal: preview.total,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Cancel end of cycle with prepaid quantity update
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User is on Pro with prepaid messages (300 messages purchased)
 * - User updates quantity to 500 messages AND cancels at end of cycle
 *
 * Expected Result:
 * - Quantity is updated to 500
 * - Product is canceling at end of cycle
 * - Invoice for the quantity difference
 */
test.concurrent(`${chalk.yellowBright("cancel end of cycle: with prepaid quantity update")}`, async () => {
	const customerId = "cancel-eoc-prepaid-qty";

	const billingUnits = 100;
	const pricePerUnit = 10;

	const prepaidItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits,
		price: pricePerUnit,
	});

	// Free is the default product (products.base has no base price = free)
	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 50 })],
		isDefault: true,
	});

	// Pro with prepaid messages and base price
	const pro = products.pro({
		id: "pro",
		items: [prepaidItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 300 }], // 3 packs
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

	// Update quantity AND cancel at end of cycle
	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 500 }], // 5 packs
		cancel: "end_of_cycle" as const,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should charge for 2 additional packs: 2 * $10 = $20
	console.log("Preview total (cancel + quantity update):", preview.total);
	expect(preview.total).toBe(20);

	await autumnV1.subscriptions.update(updateParams);

	// Verify pro is canceling
	const customerAfterUpdate =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductCanceling({
		customer: customerAfterUpdate,
		productId: pro.id,
	});

	// Free should be scheduled
	await expectProductScheduled({
		customer: customerAfterUpdate,
		productId: free.id,
	});

	// Verify quantity was updated (balance should be 500)
	expect(customerAfterUpdate.features[TestFeature.Messages].balance).toBe(500);

	// Verify Stripe subscription is correct (still set to cancel at period end)
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: true,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Downgrade then cancel end of cycle (with default)
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

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro, premium] }),
		],
		actions: [s.attach({ productId: premium.id })],
	});

	// Verify premium is active
	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterAttach,
		productId: premium.id,
	});

	// Downgrade from premium to pro
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
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

	// Now cancel premium at end of cycle
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: premium.id,
		cancel: "end_of_cycle",
	});

	// Verify state after cancel
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Premium should remain canceling
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: premium.id,
	});

	// Pro scheduled product should be REMOVED
	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: pro.id,
	});

	// Free should now be scheduled instead
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
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Downgrade then cancel end of cycle (no default)
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
		actions: [s.attach({ productId: premium.id })],
	});

	// Verify premium is active
	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterAttach,
		productId: premium.id,
	});

	// Downgrade from premium to pro
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
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

	// Now cancel premium at end of cycle
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: premium.id,
		cancel: "end_of_cycle",
	});

	// Verify state after cancel
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Premium should remain canceling
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: premium.id,
	});

	// Pro scheduled product should be REMOVED
	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: pro.id,
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
