/**
 * Update Customer Details from Checkout Tests
 *
 * Tests that customer name and email are synced from Stripe checkout
 * when checkout.session.completed webhook fires.
 *
 * These tests verify:
 * - Customer with no name/email gets updated from checkout session
 * - updateCustomerFromCheckout task properly syncs customer_details
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { completeStripeCheckoutForm } from "@tests/utils/browserPool";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Customer name/email updated from checkout
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer created with NO name and NO email
 * - Customer has NO payment method (triggers checkout flow)
 * - Attach product via billing.attach()
 * - Complete checkout form (fills in name + email)
 *
 * Expected Result:
 * - Customer's name and email are updated from checkout session
 */
test(`${chalk.yellowBright("update-customer-details: name and email synced from checkout")}`, async () => {
	const customerId = "checkout-update-details";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro-details",
		items: [messagesItem],
	});

	// Create customer with NO name, NO email, NO payment method
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, name: null, email: null }), // No paymentMethod, no name, no email
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// 1. Verify customer has no name and no email initially
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.name).toBeNull();
	expect(customerBefore.email).toBeNull();

	// 2. Attach product - should return checkout URL (no payment method)
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	// 3. Complete checkout form (fills in name and email)
	await completeStripeCheckoutForm({ url: result.payment_url });
	await timeout(12000); // Wait for webhook processing

	// 4. Verify product is attached
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfter,
		productId: pro.id,
	});

	// 5. Verify customer details were updated from checkout
	// Name should be "Test Customer" (from completeStripeCheckoutForm)
	expect(customerAfter.name).toBe("Test Customer");

	// Email should be "test@example.com" (from completeStripeCheckoutForm)
	expect(customerAfter.email).toBe("test@example.com");
});
