/**
 * Stripe Checkout Prepaid Tests — Basic Flat Prepaid
 *
 * Tests 1, 2, 4 from the original stripe-checkout-prepaid.test.ts:
 * - Prepaid quantity via checkout
 * - Prepaid quantity updated on checkout page
 * - Prepaid quantity set to 0 on checkout page
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
// TEST 1: Prepaid with quantity via checkout
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method
 * - Attach pro with prepaid messages (quantity: 300)
 *
 * Expected Result:
 * - Checkout includes base price + prepaid line item
 * - 300 credits granted after checkout
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout-prepaid 1: prepaid quantity")}`, async () => {
	const customerId = "stripe-checkout-prepaid-qty";

	const prepaidMessagesItem = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
	});

	const pro = products.pro({
		id: "pro-prepaid-checkout",
		items: [prepaidMessagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
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
		options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
	});
	expect(preview.total).toBe(40);

	// 2. Attempt attach - should return payment_url
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	// 3. Complete checkout
	await completeStripeCheckoutForm({ url: result.payment_url });

	// 4. Verify product attached and prepaid credits granted
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: pro.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 300,
		balance: 300,
		usage: 0,
	});

	// Verify invoice matches preview
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 40,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Prepaid with quantity updated on checkout page
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method
 * - Attach pro with prepaid messages (quantity: 300)
 * - On Stripe checkout page, update quantity to 5 packs (500 total)
 *
 * Note: Stripe checkout quantity INCLUDES the included usage as a pack.
 * So 5 packs = 500 total units (100 included free + 400 prepaid paid).
 *
 * Expected Result:
 * - Final state reflects checkout quantity (500), not attach quantity (300)
 * - Invoice: $20 base + 4 paid packs @ $10 = $60
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout-prepaid 2: prepaid quantity updated on checkout")}`, async () => {
	const customerId = "stripe-checkout-prepaid-qty-update";
	const includedUsage = 100;
	const billingUnits = 100;
	const pricePerPack = 10;
	const basePrice = 20;

	const prepaidMessagesItem = items.prepaidMessages({
		includedUsage,
		billingUnits,
		price: pricePerPack,
	});

	const pro = products.pro({
		id: "pro-prepaid-checkout-update",
		items: [prepaidMessagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method!
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// 1. Attach with initial quantity 300 (3 packs on Stripe, 2 paid)
	const initialQuantity = 300;
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: initialQuantity,
				adjustable: true,
			},
		],
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	// 2. Complete checkout with 5 packs (500 total units, 4 paid packs)
	const checkoutTotalUnits = 500;
	const checkoutStripePacks = checkoutTotalUnits / billingUnits; // 5 packs
	const paidPacks = (checkoutTotalUnits - includedUsage) / billingUnits; // 4 paid packs
	await completeStripeCheckoutForm({
		url: result.payment_url,
		overrideQuantity: checkoutStripePacks,
	});
	await timeout(12000);

	// 3. Verify product attached with checkout quantity (not attach quantity)
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: pro.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: checkoutTotalUnits,
		balance: checkoutTotalUnits,
		usage: 0,
	});

	// 4. Verify invoice: $20 base + 4 paid packs × $10 = $60
	const expectedTotal = basePrice + paidPacks * pricePerPack;
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotal,
	});

	// 5. Verify subscription is correct
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Prepaid quantity set to 0 on checkout (line item removed)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method
 * - Attach pro with prepaid messages (quantity: 300)
 * - On Stripe checkout page, set quantity to 0
 *
 * When quantity is 0, Stripe removes the line item from checkout.
 * The system should handle this gracefully and only grant included usage.
 *
 * Expected Result:
 * - Customer only gets included usage (0), not the requested 300
 * - Invoice: $20 base only (no prepaid charges)
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout-prepaid 3: prepaid quantity set to 0")}`, async () => {
	const customerId = "stripe-checkout-prepaid-qty-zero";
	const includedUsage = 0;
	const billingUnits = 100;
	const pricePerPack = 10;
	const basePrice = 20;

	const prepaidMessagesItem = items.prepaidMessages({
		includedUsage,
		billingUnits,
		price: pricePerPack,
	});

	const pro = products.pro({
		id: "pro-prepaid-checkout-zero",
		items: [prepaidMessagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: true }), s.products({ list: [pro] })],
		actions: [],
	});

	// 1. Attach with initial quantity 300
	const initialQuantity = 300;
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: initialQuantity,
				adjustable: true,
			},
		],
	});

	expect(result.payment_url).toBeDefined();

	// 2. Complete checkout with quantity 0 (line item removed)
	await completeStripeCheckoutForm({
		url: result.payment_url,
		overrideQuantity: 0,
	});

	// 3. Verify customer only gets included usage
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: pro.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 0,
		balance: 0,
		usage: 0,
	});

	// 4. Verify invoice: base price only, no prepaid charges
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: basePrice, // $20 only
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
