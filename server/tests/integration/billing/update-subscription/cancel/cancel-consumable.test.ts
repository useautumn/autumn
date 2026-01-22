/**
 * Cancel Consumable Tests (Customer-Level)
 *
 * Tests for canceling customer-level products with consumable/arrear items (pay-per-use overage).
 * Consumable items create a final invoice at end of cycle for any overage usage.
 *
 * Key behaviors:
 * - Overage usage is billed at cycle end (arrear pricing)
 * - Cancel end of cycle: overage billed in final invoice when cycle ends naturally
 * - Cancel immediately: NO overage billed - only base price refund (arrear overages not charged on cancel)
 * - Default update subscription behavior does NOT charge for arrear overages
 *
 * For entity-level tests, see cancel-consumable-entities.test.ts
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { calculateExpectedInvoiceAmount } from "@tests/integration/billing/utils/calculateExpectedInvoiceAmount";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { addDays } from "date-fns";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Attach → track overage → advance days → cancel immediately (no overage in invoice)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro with consumable messages (100 included, $0.10/unit overage)
 * - Track 500 messages (400 overage)
 * - Advance test clock a couple of days (mid-cycle)
 * - Cancel immediately
 *
 * Expected Result:
 * - Initial invoice: $20 (pro base price)
 * - Final invoice: prorated refund only (NO overage charge)
 * - handleInvoiceCreated is NOT triggered for usage/consumable prices on immediate cancel
 * - Product removed immediately
 *
 * This test verifies that the invoice.created webhook handler does NOT add
 * arrear/consumable usage charges when canceling immediately mid-cycle.
 */
test.concurrent(`${chalk.yellowBright("cancel consumable: attach → track overage → advance days → cancel immediately (no overage in invoice)")}`, async () => {
	const customerId = "cancel-cons-adv-imm";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1Beta, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Verify pro is active
	const customerAfterAttach =
		await autumnV1Beta.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterAttach,
		productId: pro.id,
	});

	// Initial attach invoice: $20 base price
	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 1,
		latestTotal: 20,
	});

	// Track 500 messages (100 included, 400 overage)
	// Note: This overage will NOT be charged when canceling immediately
	await autumnV1Beta.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 500,
	});

	// Verify usage was tracked (400 overage = balance should be -400)
	const customerAfterTrack =
		await autumnV1Beta.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfterTrack.features[TestFeature.Messages].balance).toBe(-400);

	// Advance test clock 5 days mid-cycle
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addDays(new Date(), 5).getTime(),
		waitForSeconds: 10,
	});

	// Preview cancel immediately
	const cancelParams = {
		customer_id: customerId,
		product_id: pro.id,
		cancel: "immediately" as const,
	};
	const preview = await autumnV1Beta.subscriptions.previewUpdate(cancelParams);

	// Final invoice should be a prorated refund only (negative), NO overage
	// After 5 days of a ~30 day cycle, refund is roughly (25/30) * $20 ≈ -$16.67
	// The key assertion: invoice should be NEGATIVE (refund only, no overage charge)
	expect(preview.total).toBeLessThan(0);

	// Execute cancel
	await autumnV1Beta.subscriptions.update(cancelParams);

	// Verify pro is removed
	const customerAfterCancel =
		await autumnV1Beta.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: pro.id,
	});

	// Verify no Stripe subscription exists
	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Should have 2 invoices: initial ($20) + final (refund, negative)
	expect(customerAfterCancel.invoices?.length).toBe(2);

	// Final invoice should match preview (negative = refund only, no overage)
	const finalInvoice = customerAfterCancel.invoices?.[0];
	expect(finalInvoice?.total).toBe(preview.total);
	expect(finalInvoice?.total).toBeLessThan(0);

	// Calculate what overage WOULD have been if charged: 400 * $0.10 = $40
	// If overage was incorrectly included, total would be: $40 - refund ≈ $23+
	// By asserting total < 0, we confirm overage is NOT in the invoice
	const overageIfCharged = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 500 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(overageIfCharged).toBe(40);

	// The final invoice should be much less than the overage amount
	// (in fact, it should be negative since it's just a refund)
	expect(finalInvoice?.total).toBeLessThan(overageIfCharged);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Track → cancel end of cycle → advance (customer-level)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro with consumable messages (100 included, $0.10/unit overage)
 * - Track 500 messages (400 overage)
 * - Cancel end of cycle
 * - Advance to next invoice
 *
 * Expected Result:
 * - Initial invoice: $20 (pro base price)
 * - Final invoice: $40 (400 overage * $0.10)
 * - Product removed after cycle ends
 *
 * Migrated from: cancel2.test.ts
 */
test.concurrent(`${chalk.yellowBright("cancel consumable: track → cancel end of cycle → advance")}`, async () => {
	const customerId = "cancel-cons-eoc-cus";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1Beta, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Verify pro is active
	const customerAfterAttach =
		await autumnV1Beta.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterAttach,
		productId: pro.id,
	});

	// Initial attach invoice: $20 base price
	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 1,
		latestTotal: 20,
	});

	// Track 500 messages (100 included, 400 overage)
	await autumnV1Beta.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 500,
	});

	// Cancel end of cycle
	await autumnV1Beta.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel: "end_of_cycle",
	});

	// Verify pro is canceling
	const customerAfterCancel =
		await autumnV1Beta.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: pro.id,
	});

	// Advance to next invoice
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Calculate expected overage amount using new synchronous utility
	// 500 total usage - 100 included = 400 overage * $0.10 = $40
	const expectedOverage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 500 }],
		options: { includeFixed: false, onlyArrear: true },
	});

	expect(expectedOverage).toBe(40);

	// Verify final state
	const customerAfterAdvance =
		await autumnV1Beta.customers.get<ApiCustomerV3>(customerId);

	// Product should be removed
	await expectProductNotPresent({
		customer: customerAfterAdvance,
		productId: pro.id,
	});

	// Should have 2 invoices: initial ($20) + final overage ($40)
	expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 2,
		latestTotal: expectedOverage,
		latestInvoiceProductId: pro.id,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Track → cancel immediately (customer-level) - no overage charge
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro with consumable messages (100 included, $0.10/unit overage)
 * - Track 500 messages (400 overage)
 * - Cancel immediately
 *
 * Expected Result:
 * - Initial invoice: $20 (pro base price)
 * - Final invoice: -$20 (base refund only, no overage - arrear overages not charged on cancel)
 * - Product removed immediately
 */
test.concurrent(`${chalk.yellowBright("cancel consumable: track → cancel immediately - no overage charge")}`, async () => {
	const customerId = "cancel-cons-imm-cus";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, ctx } = await initScenario({
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

	// Initial attach invoice: $20 base price
	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 1,
		latestTotal: 20,
	});

	// Track 500 messages (100 included, 400 overage)
	// Note: This overage will NOT be charged when canceling immediately
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 500,
	});

	// Preview cancel immediately
	const cancelParams = {
		customer_id: customerId,
		product_id: pro.id,
		cancel: "immediately" as const,
	};
	const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);

	// Final invoice = base refund only (-$20), no overage charged on cancel
	expect(preview.total).toBe(-20);

	// Execute cancel
	await autumnV1.subscriptions.update(cancelParams);

	// Verify pro is removed
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: pro.id,
	});

	// Verify no Stripe subscription exists
	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Should have 2 invoices: initial ($20) + final (refund -$20)
	expect(customerAfterCancel.invoices?.length).toBe(2);

	// Verify final invoice matches preview (refund only)
	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 2,
		latestTotal: preview.total,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Track → cancel immediately with failed payment
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro with consumable messages
 * - Track usage into overage
 * - Switch to failing payment method
 * - Cancel immediately
 *
 * Expected Result:
 * - Final invoice: refund only (-$20), no overage charged on cancel
 * - Since it's a refund (credit), no payment attempt needed
 * - Product still removed
 */
test.concurrent(`${chalk.yellowBright("cancel consumable: track → cancel immediately with failed payment - refund only")}`, async () => {
	const customerId = "cancel-cons-fail-pay";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attachPaymentMethod({ type: "fail" }), // Switch to failing card
		],
	});

	// Verify pro is active
	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterAttach,
		productId: pro.id,
	});

	// Track 1000 messages (900 overage)
	// Note: This overage will NOT be charged when canceling immediately
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 1000,
	});

	// Cancel immediately (with failing payment method)
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel: "immediately",
	});

	// Verify product is removed
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: pro.id,
	});

	// Verify invoice was created
	expect(customerAfterCancel.invoices?.length).toBeGreaterThanOrEqual(2);

	// Find the final invoice (most recent)
	const finalInvoice = customerAfterCancel.invoices?.[0];

	// Final invoice should be a refund (-$20), no overage charged on cancel
	// Refunds/credits don't require payment, so status should be 'paid' (applied as credit)
	expect(finalInvoice?.total).toBe(-20);
});
