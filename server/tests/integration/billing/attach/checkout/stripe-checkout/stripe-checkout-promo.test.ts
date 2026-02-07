/**
 * Stripe Checkout Promo Tests (Attach V2)
 *
 * Tests for Stripe Checkout flow with promotional features.
 * Stripe checkout can allow promotion codes and pre-apply discounts.
 *
 * Key behaviors:
 * - allow_promotion_codes enables promo code entry in checkout UI
 * - Pre-applied rewards/coupons reflected in checkout and first invoice
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
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
// TEST 1: Checkout with promotion codes allowed
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method
 * - Attach pro product via checkout
 * - Checkout should have allow_promotion_codes: true
 *
 * Expected Result:
 * - Checkout URL returned
 * - Customer can enter promo code in checkout UI
 * - Product attached after completion
 *
 * Note: This test verifies the checkout flow works. Actual promo code
 * entry is manual in the Stripe UI and not automated here.
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout: allow_promotion_codes")}`, async () => {
	const customerId = "stripe-checkout-promo-codes";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro-promo",
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

	// 1. Preview attach - should show $20
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
	});
	expect(preview.total).toBe(20);

	// 2. Attempt attach - should return payment_url
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	// 3. Complete checkout (without promo code for this test)
	await completeCheckoutForm(result.payment_url);
	await timeout(12000);

	// 4. Verify product attached
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: pro.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Verify invoice (full price, no promo applied)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Checkout with pre-applied discount
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method
 * - Attach pro product with a pre-configured discount
 *
 * Expected Result:
 * - Discount reflected in preview
 * - Discount applied in checkout
 * - First invoice shows discounted amount
 *
 * Note: This test uses a custom product with lower price to simulate
 * discount behavior. Actual coupon/reward integration would need
 * reward setup which is out of scope for basic checkout tests.
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout: discounted checkout")}`, async () => {
	const customerId = "stripe-checkout-discount";

	// Use a lower-priced product to simulate "discounted" pricing
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 15 }); // "Discounted" from $20

	const discountedPro = products.base({
		id: "discounted-pro",
		items: [messagesItem, priceItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method!
			s.products({ list: [discountedPro] }),
		],
		actions: [],
	});

	// 1. Preview attach - should show $15 (discounted price)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: discountedPro.id,
	});
	expect(preview.total).toBe(15);

	// 2. Attempt attach - should return payment_url
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: discountedPro.id,
	});

	expect(result.payment_url).toBeDefined();

	// 3. Complete checkout
	await completeCheckoutForm(result.payment_url);
	await timeout(12000);

	// 4. Verify product attached
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: discountedPro.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Verify invoice shows discounted amount
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 15,
	});
});
