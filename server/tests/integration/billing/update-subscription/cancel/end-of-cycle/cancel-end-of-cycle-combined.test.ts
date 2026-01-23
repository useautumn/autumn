/**
 * Cancel End of Cycle with Other Parameters Tests
 *
 * Tests for `cancel: 'end_of_cycle'` combined with other update parameters:
 * - Custom plan items (items parameter)
 * - Prepaid quantity updates (options parameter)
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Cancel end of cycle with custom plan items
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
		cancel_action: "cancel_end_of_cycle" as const,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

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
// TEST 2: Cancel end of cycle with prepaid quantity update
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
		cancel_action: "cancel_end_of_cycle" as const,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should charge for 2 additional packs: 2 * $10 = $20

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
