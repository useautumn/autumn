/**
 * Stripe Checkout Basic Tests (Attach V2)
 *
 * Tests for Stripe Checkout flow when customer has NO payment method.
 * When checkoutMode = "stripe_checkout", attach returns a checkout_url
 * that the customer uses to complete payment.
 *
 * Key behaviors:
 * - No payment method → triggers stripe_checkout mode
 * - Returns checkout_url instead of charging directly
 * - Product is attached after checkout completion
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
// TEST 1: No product → pro (new customer, no payment method)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - New customer with NO payment method
 * - Attach pro product
 *
 * Expected Result:
 * - Returns checkout_url (Stripe Checkout session)
 * - After completing checkout: product is attached, invoice paid
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout: no product → pro")}`, async () => {
	const customerId = "stripe-checkout-no-pm-pro";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro-checkout",
		items: [messagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method!
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	return;

	// 1. Preview attach - should show $20
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
	});
	expect((preview as AttachPreview).due_today.total).toBe(20);

	// 2. Attempt attach - should return checkout_url (not charge directly)
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	// Verify checkout_url is returned
	expect(result.checkout_url).toBeDefined();
	expect(result.checkout_url).toContain("checkout.stripe.com");

	// 3. Complete checkout form
	await completeCheckoutForm(result.checkout_url);
	await timeout(12000); // Wait for webhook processing

	// 4. Verify product is now attached
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: pro.id,
	});

	// Verify messages feature
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Verify invoice was paid (matches preview total)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Free → pro (upgrade via checkout)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on free product, NO payment method
 * - Attach pro product (upgrade)
 *
 * Expected Result:
 * - Returns checkout_url
 * - After checkout: pro replaces free
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout: free → pro")}`, async () => {
	const customerId = "stripe-checkout-free-to-pro";

	const messagesItem = items.monthlyMessages({ includedUsage: 50 });
	const free = products.base({
		id: "free-checkout",
		items: [messagesItem],
	});

	const proMessagesItem = items.monthlyMessages({ includedUsage: 200 });
	const pro = products.pro({
		id: "pro-checkout-upgrade",
		items: [proMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method!
			s.products({ list: [free, pro] }),
		],
		actions: [],
	});

	// 1. First attach free product (no checkout needed - it's free)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: free.id,
	});

	// Verify free is attached
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer,
		productId: free.id,
	});

	// 2. Preview upgrade to pro - should show $20
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
	});
	expect((preview as AttachPreview).due_today.total).toBe(20);

	// 3. Attempt attach pro - should return checkout_url
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	expect(result.checkout_url).toBeDefined();

	// 4. Complete checkout
	await completeCheckoutForm(result.checkout_url);
	await timeout(12000);

	// 5. Verify pro replaced free
	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: pro.id,
	});

	// Verify messages feature from pro (200, not 50)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 200,
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
// TEST 3: One-off via checkout (mode: "payment")
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method
 * - Attach one-off product
 *
 * Expected Result:
 * - Returns checkout_url with mode: "payment" (not subscription)
 * - Credits granted after checkout
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout: one-off purchase")}`, async () => {
	const customerId = "stripe-checkout-one-off";

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const oneOff = products.oneOff({
		id: "one-off-checkout",
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
		options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
	});
	expect((preview as AttachPreview).due_today.total).toBe(20);

	// 2. Attempt attach - should return checkout_url
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
	});

	expect(result.checkout_url).toBeDefined();

	// 3. Complete checkout
	await completeCheckoutForm(result.checkout_url);
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
