/**
 * Stripe Checkout One-Off Tests (Attach V2)
 *
 * Tests for Stripe Checkout flow with one-off (non-recurring) products.
 * One-off products use Stripe Checkout in mode: "payment" (not subscription).
 *
 * Key behaviors:
 * - One-off products create payment sessions, not subscription sessions
 * - Credits are granted after checkout completion
 * - Quantity options are reflected in checkout line items
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, AttachPreview } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { completeCheckoutForm } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: One-off credits via checkout
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method
 * - Attach one-off credits product
 *
 * Expected Result:
 * - Checkout mode: "payment" (not subscription)
 * - Credits granted after checkout completion
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout: one-off credits")}`, async () => {
	const customerId = "stripe-checkout-one-off-credits";

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const oneOff = products.oneOff({
		id: "one-off-credits",
		items: [oneOffMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method!
			s.products({ list: [oneOff] }),
		],
		actions: [],
	});

	// 1. Preview attach - base ($10) + messages ($10) = $20
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
	});
	expect((preview as AttachPreview).due_today.total).toBe(20);

	// 2. Attempt attach - should return payment_url
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	// 3. Complete checkout
	await completeCheckoutForm(result.payment_url);
	await timeout(12000);

	// 4. Verify credits were granted
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: oneOff.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 100,
		usage: 0,
	});

	// Verify invoice
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: One-off with higher quantity
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method
 * - Attach one-off with quantity: 500 (5 packs)
 *
 * Expected Result:
 * - Quantity reflected in checkout line items
 * - 500 credits granted after checkout
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout: one-off with quantity")}`, async () => {
	const customerId = "stripe-checkout-one-off-quantity";

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const oneOff = products.oneOff({
		id: "one-off-quantity",
		items: [oneOffMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method!
			s.products({ list: [oneOff] }),
		],
		actions: [],
	});

	// 1. Preview attach - base ($10) + 5 packs @ $10 = $60
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 500 }],
	});
	expect((preview as AttachPreview).due_today.total).toBe(60);

	// 2. Attempt attach - should return payment_url
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 500 }],
	});

	expect(result.payment_url).toBeDefined();

	// 3. Complete checkout
	await completeCheckoutForm(result.payment_url);
	await timeout(12000);

	// 4. Verify 500 credits were granted
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: oneOff.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 500,
		usage: 0,
	});

	// Verify invoice matches preview
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 60,
	});
});
