/**
 * Invoice Deferred Line Items Tests
 *
 * Tests that invoice line items are correctly stored when billing is deferred
 * (payment doesn't succeed immediately). Two scenarios:
 *
 * A: Invoice mode (finalized, deferred) — invoice is created in open state,
 *    line items should be stored immediately, then still correct after payment.
 *
 * B: Payment failure (3DS required) — billing plan is deferred because card
 *    requires authentication. Line items should be stored on the open invoice,
 *    then still correct after 3DS completion.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectInvoiceLineItemsCorrect } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeInvoiceCheckoutV2 as completeInvoiceCheckout } from "@tests/utils/browserPool/completeInvoiceCheckoutV2";
import { completeInvoiceConfirmationV2 as completeInvoiceConfirmation } from "@tests/utils/browserPool/completeInvoiceConfirmationV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST A: Invoice mode (finalized, deferred) — line items on open invoice
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with payment method
 * - Pro ($20/mo) with prepaid messages ($10/100 units, 0 included)
 * - Attach with invoice mode: finalized + deferred (enable_product_immediately: false)
 *
 * Expected:
 * - Invoice created in "open" state with payment_url
 * - Line items stored immediately (before payment):
 *   - Base price: $20
 *   - Prepaid messages: $20 (200 units = 2 packs × $10)
 * - After payment: line items still correct, invoice is "paid"
 */
test.concurrent(`${chalk.yellowBright("deferred-line-items A: invoice mode (finalized, deferred)")}`, async () => {
	const customerId = "def-li-invoice-mode";

	const prepaidMessages = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const basePrice = 20;
	const messagesQuantity = 200;
	const messagesPrice = 20; // 2 packs × $10
	const expectedTotal = basePrice + messagesPrice; // $40

	const pro = products.pro({
		id: "pro-def-inv",
		items: [prepaidMessages],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// Attach with invoice mode (finalized, deferred)
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: messagesQuantity }],
		invoice: true,
		finalize_invoice: true,
		enable_product_immediately: false,
		redirect_mode: "if_required",
	});

	// Verify invoice is open
	expect(result.invoice).toBeDefined();
	expect(result.invoice!.status).toBe("open");
	expect(result.invoice!.stripe_id).toBeDefined();
	expect(result.payment_url).toBeDefined();

	const stripeInvoiceId = result.invoice!.stripe_id;

	// ═════════════════════════════════════════════════════════════════════
	// KEY TEST: Line items should be stored BEFORE payment (open invoice)
	// ═════════════════════════════════════════════════════════════════════

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId,
		expectedTotal,
		allCharges: true,
		expectedLineItems: [
			{ isBasePrice: true, amount: basePrice },
			{
				featureId: TestFeature.Messages,
				totalAmount: messagesPrice,
				billingTiming: "in_advance",
			},
		],
	});

	// Complete payment
	await completeInvoiceCheckout({ url: result.payment_url! });

	// Wait for webhook processing
	await timeout(5000);

	// Verify invoice is now paid
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 1,
		latestTotal: expectedTotal,
		latestStatus: "paid",
	});

	await expectProductActive({
		customer: customerAfter,
		productId: pro.id,
	});

	// Line items should still be correct after payment
	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId,
		expectedTotal,
		allCharges: true,
		expectedLineItems: [
			{ isBasePrice: true, amount: basePrice },
			{
				featureId: TestFeature.Messages,
				totalAmount: messagesPrice,
				billingTiming: "in_advance",
			},
		],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST B: Payment failure (3DS required) — line items on deferred invoice
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with 3DS-requiring payment method
 * - Pro ($20/mo) with prepaid messages ($10/100 units, 0 included)
 * - Attach normally (no invoice mode flags) — triggers 3DS deferral
 *
 * Expected:
 * - required_action.code = "3ds_required", payment_url provided
 * - Invoice is in "open" state
 * - Line items stored immediately (before 3DS completion):
 *   - Base price: $20
 *   - Prepaid messages: $20 (200 units = 2 packs × $10)
 * - After 3DS: line items still correct, product is active
 */
test.concurrent(`${chalk.yellowBright("deferred-line-items B: payment failure (3DS required)")}`, async () => {
	const customerId = "def-li-3ds";

	const prepaidMessages = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const basePrice = 20;
	const messagesQuantity = 200;
	const messagesPrice = 20; // 2 packs × $10
	const expectedTotal = basePrice + messagesPrice; // $40

	const pro = products.pro({
		id: "pro-def-3ds",
		items: [prepaidMessages],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "authenticate" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// Attach normally — should trigger 3DS deferral
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: messagesQuantity }],
	});

	// Verify 3DS required
	expect(result.required_action).toBeDefined();
	expect(result.required_action?.code).toBe("3ds_required");
	expect(result.payment_url).toBeDefined();

	// Verify invoice exists and is open
	expect(result.invoice).toBeDefined();
	expect(result.invoice!.stripe_id).toBeDefined();

	const stripeInvoiceId = result.invoice!.stripe_id;

	// Verify Stripe invoice is open
	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(stripeInvoiceId);
	expect(stripeInvoice.status).toBe("open");

	// ═════════════════════════════════════════════════════════════════════
	// KEY TEST: Line items should be stored BEFORE 3DS completion
	// ═════════════════════════════════════════════════════════════════════

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId,
		expectedTotal,
		allCharges: true,
		expectedLineItems: [
			{ isBasePrice: true, amount: basePrice },
			{
				featureId: TestFeature.Messages,
				totalAmount: messagesPrice,
				billingTiming: "in_advance",
			},
		],
	});

	// Product should NOT be active before 3DS
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features?.[TestFeature.Messages]).toBeUndefined();

	// Complete 3DS authentication
	await completeInvoiceConfirmation({ url: result.payment_url! });

	// Wait for webhook processing
	await timeout(5000);

	// Verify product is now active
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer: customerAfter,
		productId: pro.id,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 1,
		latestTotal: expectedTotal,
		latestStatus: "paid",
	});

	// Line items should still be correct after payment
	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId,
		expectedTotal,
		allCharges: true,
		expectedLineItems: [
			{ isBasePrice: true, amount: basePrice },
			{
				featureId: TestFeature.Messages,
				totalAmount: messagesPrice,
				billingTiming: "in_advance",
			},
		],
	});
});
