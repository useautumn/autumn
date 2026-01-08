import { expect, test } from "bun:test";
import { expectCustomerInvoiceCorrect } from "@tests/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductCanceled,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts";

/**
 * Update While Canceling Tests
 *
 * Tests for updating a subscription that is in the process of being canceled
 * or is scheduled to downgrade.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Update while canceling
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User is on Pro (paid product)
 * - Free default product exists
 * - User cancels Pro → free default is scheduled
 * - User updates Pro product items
 *
 * Expected Result:
 * - Pro should remain canceling (canceling state preserved)
 * - Scheduled free product should remain scheduled
 * - Stripe subscription is correct (still set to cancel at period end)
 */
test.concurrent(`${chalk.yellowBright("update while canceling")}`, async () => {
	const customerId = "upd-while-canceling";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	// Free is the default product
	const free = constructProduct({
		id: "free",
		items: [messagesItem],
		type: "free",
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
		actions: [
			s.attach({ productId: "pro" }),
			s.cancel({ productId: "pro" }), // Cancel pro → free scheduled
		],
	});

	// Verify pro is canceled and free is scheduled
	const customerAfterCancel = await autumnV1.customers.get(customerId);
	await expectProductCanceled({
		customer: customerAfterCancel,
		productId: pro.id,
	});
	await expectProductScheduled({
		customer: customerAfterCancel,
		productId: free.id,
	});

	// Now update pro's items while it's canceling
	const updatedMessagesItem = items.monthlyMessages({ includedUsage: 200 });
	const newPriceItem = items.monthlyPrice({ price: 30 }); // $30/mo instead of $20

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: pro.id,
		items: [updatedMessagesItem, newPriceItem],
	});

	// Should charge prorated difference for price increase ($10 prorated)
	console.log("Preview total (update while canceling):", preview.total);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		items: [updatedMessagesItem, newPriceItem],
	});

	// Verify state after update
	const customerAfterUpdate = await autumnV1.customers.get(customerId);

	// Pro should remain canceling (canceling state preserved)
	await expectProductCanceled({
		customer: customerAfterUpdate,
		productId: pro.id,
	});

	// Scheduled free product should remain scheduled
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

	// Verify invoices
	expectCustomerInvoiceCorrect({
		customer: customerAfterUpdate,
		count: 2, // Initial pro attach + update
		latestTotal: preview.total,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Update while downgrading
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User is on Premium
 * - User downgrades from Premium → Pro (Premium is canceling, Pro is scheduled)
 * - User updates the canceling Premium product
 *
 * Expected Result:
 * - Premium product should remain canceling (with updated items)
 * - Scheduled Pro product should remain scheduled
 * - After advancing test clock, Pro should become active
 */
test.concurrent(`${chalk.yellowBright("update while downgrading")}`, async () => {
	const customerId = "upd-while-downgrading";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const consumableItem = items.consumableMessages({ includedUsage: 50 });

	// Premium product ($50/mo)
	const premium = constructProduct({
		id: "premium",
		items: [consumableItem],
		type: "premium",
		isDefault: false,
	});

	// Pro product ($20/mo)
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [s.attach({ productId: "premium" })],
	});

	// Verify premium is active
	const customerAfterAttach = await autumnV1.customers.get(customerId);
	await expectProductActive({
		customer: customerAfterAttach,
		productId: premium.id,
	});

	// User downgrades from premium to pro (premium becomes canceling, pro is scheduled)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	// Verify premium is canceled and pro is scheduled
	const customerAfterDowngrade = await autumnV1.customers.get(customerId);
	await expectProductCanceled({
		customer: customerAfterDowngrade,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: customerAfterDowngrade,
		productId: pro.id,
	});

	// Now update the canceling premium's items (not the scheduled pro)
	const updatedConsumableItem = items.consumableMessages({
		includedUsage: 100,
	}); // Increase from 50 to 100
	const newPriceItem = items.monthlyPrice({ price: 60 }); // $60/mo instead of $50

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: premium.id,
		items: [updatedConsumableItem, newPriceItem],
	});

	console.log("Preview total (update canceling product):", preview.total);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: premium.id,
		items: [updatedConsumableItem, newPriceItem],
	});

	// Verify state after update
	const customerAfterUpdate = await autumnV1.customers.get(customerId);

	console.log("Products after update:", customerAfterUpdate.products);

	// Premium product should remain canceling (with updated items)
	await expectProductCanceled({
		customer: customerAfterUpdate,
		productId: premium.id,
	});

	// Scheduled pro product should remain scheduled
	await expectProductScheduled({
		customer: customerAfterUpdate,
		productId: pro.id,
	});

	// Verify Stripe subscription is correct (still set to cancel at period end)
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
		shouldBeCanceled: true,
	});

	// Verify invoices - should have initial premium attach + update
	expectCustomerInvoiceCorrect({
		customer: customerAfterUpdate,
		count: 2,
		latestTotal: preview.total,
	});

	// Advance to next billing cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// After advancing, pro should be active and premium should be gone
	const customerAfterAdvance = await autumnV1.customers.get(customerId);

	console.log("Products after advance:", customerAfterAdvance.products);

	// Pro should now be active
	await expectProductActive({
		customer: customerAfterAdvance,
		productId: pro.id,
	});

	// Premium should no longer be present
	await expectProductNotPresent({
		customer: customerAfterAdvance,
		productId: premium.id,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Update while canceling (preserves usage)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User is on Pro with some usage tracked
 * - User cancels Pro → free default is scheduled
 * - User updates Pro product items (increases included usage)
 *
 * Expected Result:
 * - Pro should remain canceling (canceling state preserved)
 * - Scheduled free product should remain scheduled
 * - Usage should be preserved
 * - Stripe subscription is correct (still set to cancel at period end)
 */
test.concurrent(`${chalk.yellowBright("update while canceling: preserves usage")}`, async () => {
	const customerId = "upd-while-cancel-usage";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	// Free is the default product
	const free = constructProduct({
		id: "free",
		items: [messagesItem],
		type: "free",
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
		actions: [s.attach({ productId: "pro" })],
	});

	// Track some usage
	const messagesUsage = 50;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	// Verify usage tracked
	const customerWithUsage = await autumnV1.customers.get(customerId);
	expect(customerWithUsage.features[TestFeature.Messages].usage).toBe(
		messagesUsage,
	);

	// Cancel pro → free scheduled
	await autumnV1.cancel({
		customer_id: customerId,
		product_id: pro.id,
	});

	// Verify pro is canceled and free is scheduled
	const customerAfterCancel = await autumnV1.customers.get(customerId);
	await expectProductCanceled({
		customer: customerAfterCancel,
		productId: pro.id,
	});
	await expectProductScheduled({
		customer: customerAfterCancel,
		productId: free.id,
	});

	// Now update pro's items while it's canceling
	const updatedMessagesItem = items.monthlyMessages({ includedUsage: 200 });

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: pro.id,
		items: [updatedMessagesItem, items.monthlyPrice()],
	});

	console.log(
		"Preview total (update while canceling with usage):",
		preview.total,
	);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		items: [updatedMessagesItem, items.monthlyPrice()],
	});

	// Verify state after update
	const customerAfterUpdate = await autumnV1.customers.get(customerId);

	// Pro should remain canceling (canceling state preserved)
	await expectProductCanceled({
		customer: customerAfterUpdate,
		productId: pro.id,
	});

	// Scheduled free product should remain scheduled
	await expectProductScheduled({
		customer: customerAfterUpdate,
		productId: free.id,
	});

	// Usage should be preserved
	expect(customerAfterUpdate.features[TestFeature.Messages].usage).toBe(
		messagesUsage,
	);

	// Verify Stripe subscription is correct (still set to cancel at period end)
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: true,
	});
});
