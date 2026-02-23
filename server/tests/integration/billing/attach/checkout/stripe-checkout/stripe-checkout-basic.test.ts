/**
 * Stripe Checkout Basic Tests (Attach V2)
 *
 * Tests for Stripe Checkout flow when customer has NO payment method.
 * When checkoutMode = "stripe_checkout", attach returns a payment_url
 * that the customer uses to complete payment.
 *
 * Key behaviors:
 * - No payment method → triggers stripe_checkout mode
 * - Returns payment_url instead of charging directly
 * - Product is attached after checkout completion
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
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
 * - Returns payment_url (Stripe Checkout session)
 * - After completing checkout: product is attached, invoice paid
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout: no product → pro")}`, async () => {
	const customerId = "stripe-checkout-no-pm-pro";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro-checkout",
		items: [messagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method!
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// 1. Preview attach - should show $20
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
	});
	expect(preview.total).toBe(20);

	// 2. Attempt attach - should return payment_url (not charge directly)
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	// Verify payment_url is returned
	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	// 3. Complete checkout form
	await completeStripeCheckoutForm({ url: result.payment_url });
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

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
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
 * - Returns payment_url
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
	expect(preview.total).toBe(20);

	// 3. Attempt attach pro - should return payment_url
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	expect(result.payment_url).toBeDefined();

	// 4. Complete checkout
	await completeStripeCheckoutForm({ url: result.payment_url });
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
