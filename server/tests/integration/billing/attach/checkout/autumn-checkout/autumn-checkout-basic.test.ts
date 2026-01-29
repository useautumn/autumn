/**
 * Autumn Checkout Basic Tests (Attach V2)
 *
 * Tests for Autumn Checkout flow when customer HAS a payment method
 * but redirect_mode is set to "always".
 *
 * When checkoutMode = "autumn_checkout", attach returns an autumn confirmation
 * page URL instead of charging directly, giving the customer a chance to
 * review before payment.
 *
 * Key behaviors:
 * - Has payment method + redirect_mode: "always" → autumn_checkout mode
 * - Returns confirmation page URL
 * - Product is attached after user confirms
 */

import { expect, test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: With payment method + redirect_mode: "always" → autumn_checkout
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer HAS a payment method
 * - Attach pro product with redirect_mode: "always"
 *
 * Expected Result:
 * - Returns autumn checkout/confirmation URL (not stripe checkout)
 * - Does NOT charge immediately
 * - Product attached after user confirms on autumn page
 *
 * NOTE: This test defines expected behavior. Implementation pending per ENG-1013.
 */
test.concurrent(`${chalk.yellowBright("autumn-checkout: with PM + redirect_mode always")}`, async () => {
	const customerId = "autumn-checkout-redirect-always";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro-autumn-checkout",
		items: [messagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }), // HAS payment method
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

	// 2. Attempt attach with redirect_mode: "always"
	// This should return a confirmation URL instead of charging directly
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "always",
	});

	console.log("result:", result);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Future tests to implement once autumn checkout is built:
// ═══════════════════════════════════════════════════════════════════════════════
//
// TEST 2: autumn-checkout: complete flow and verify product attached
// TEST 3: autumn-checkout: cancel flow (user doesn't confirm)
// TEST 4: autumn-checkout: with prepaid options
// TEST 5: autumn-checkout: entity-level attach
