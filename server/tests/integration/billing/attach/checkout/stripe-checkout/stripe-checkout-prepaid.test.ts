/**
 * Stripe Checkout Prepaid Tests (Attach V2)
 *
 * Tests for Stripe Checkout flow with prepaid features.
 * Prepaid items require options with quantity on attach,
 * and the quantity is reflected in checkout line items.
 *
 * Key behaviors:
 * - Prepaid quantity reflected in checkout
 * - Base price + prepaid price combined in checkout
 * - Prepaid on free product creates checkout for prepaid only
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
// TEST 1: Prepaid with quantity via checkout
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method
 * - Attach pro with prepaid messages (quantity: 200)
 *
 * Expected Result:
 * - Checkout includes base price + prepaid line item
 * - 200 credits granted after checkout
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout: prepaid quantity")}`, async () => {
	const customerId = "stripe-checkout-prepaid-qty";

	const prepaidMessagesItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const pro = products.pro({
		id: "pro-prepaid-checkout",
		items: [prepaidMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method!
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// 1. Preview attach - base ($20) + 2 packs @ $10 = $40
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
	});
	expect((preview as AttachPreview).due_today.total).toBe(40);

	// 2. Attempt attach - should return payment_url
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	// 3. Complete checkout
	await completeCheckoutForm(result.payment_url);
	await timeout(12000);

	// 4. Verify product attached and prepaid credits granted
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: pro.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});

	// Verify invoice matches preview
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 40,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Prepaid on free product via checkout
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has free product (attached without checkout)
 * - Remove payment method
 * - Attach prepaid pack to free product (no PM)
 *
 * Expected Result:
 * - Checkout for prepaid only (free product remains)
 * - Prepaid credits granted after checkout
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout: prepaid on free product")}`, async () => {
	const customerId = "stripe-checkout-prepaid-free";

	const messagesItem = items.monthlyMessages({ includedUsage: 50 });
	const free = products.base({
		id: "free-with-prepaid",
		items: [messagesItem],
	});

	const prepaidMessagesItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const prepaidAddon = products.base({
		id: "prepaid-addon",
		items: [prepaidMessagesItem],
		isAddOn: true,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method
			s.products({ list: [free, prepaidAddon] }),
		],
		actions: [
			// Attach free product (no checkout needed)
			s.attach({ productId: free.id }),
		],
	});

	// Verify free product is attached
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer,
		productId: free.id,
	});

	// Preview prepaid addon attach - should show $10 (1 pack)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: prepaidAddon.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
	});
	expect((preview as AttachPreview).due_today.total).toBe(10);

	// Attempt attach prepaid addon - should return payment_url
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: prepaidAddon.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
	});

	expect(result.payment_url).toBeDefined();

	// Complete checkout
	await completeCheckoutForm(result.payment_url);
	await timeout(12000);

	// Verify both products attached
	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: free.id,
	});

	await expectProductActive({
		customer,
		productId: prepaidAddon.id,
	});

	// Verify messages: 50 (free included) + 100 (prepaid) = 150
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 150,
		usage: 0,
	});

	// Verify invoice
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 10,
	});
});
