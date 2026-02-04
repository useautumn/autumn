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
	expect(preview.total).toBe(20);

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
	expect(preview.total).toBe(60);

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

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: One-off with included usage and flat price
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method
 * - Attach one-off with included usage (100 free) and flat price ($10/pack)
 * - Request 300 units total (100 free + 200 paid = 2 packs)
 *
 * Expected Result:
 * - 300 total credits granted (100 included + 200 purchased)
 * - Invoice: base ($10) + 2 packs @ $10 = $30
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout: one-off with included usage")}`, async () => {
	const customerId = "stripe-checkout-one-off-included";
	const includedUsage = 100;
	const billingUnits = 100;
	const pricePerPack = 10;
	const basePrice = 10;

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage,
		billingUnits,
		price: pricePerPack,
	});

	const oneOff = products.oneOff({
		id: "one-off-included",
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

	// 300 total units = 3 packs (1 free from includedUsage + 2 paid)
	const quantity = 300;
	const paidPacks = (quantity - includedUsage) / billingUnits; // 2 packs
	const expectedTotal = basePrice + paidPacks * pricePerPack; // $10 + $20 = $30

	// 1. Preview attach
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(preview.total).toBe(expectedTotal);

	// 2. Attempt attach - should return payment_url
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	// 3. Complete checkout
	await completeCheckoutForm(result.payment_url);
	await timeout(12000);

	// 4. Verify credits were granted (total = included + purchased)
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: oneOff.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: quantity,
		usage: 0,
	});

	// Verify invoice
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotal,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: One-off with included usage AND tiered pricing
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method
 * - Attach one-off with:
 *   - Included usage: 100 units (1 free pack)
 *   - Tiered pricing: 0-500 @ $10/pack, 501+ @ $5/pack
 * - Request 800 units total
 *
 * Expected Result:
 * - 800 total credits granted
 * - Pricing: 1 free pack + 5 packs @ $10 + 2 packs @ $5 = $60
 * - Invoice: base ($10) + $60 = $70
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout: one-off with tiered pricing")}`, async () => {
	const customerId = "stripe-checkout-one-off-tiered";
	const includedUsage = 100;
	const billingUnits = 100;
	const basePrice = 10;

	// Tiered pricing: 0-500 at $10/pack, 501+ at $5/pack (last tier must be "inf")
	const tieredOneOffItem = items.tieredOneOffMessages({
		includedUsage,
		billingUnits,
		tiers: [
			{ to: 500, amount: 10 },
			{ to: "inf", amount: 5 },
		],
	});

	const oneOff = products.oneOff({
		id: "one-off-tiered",
		items: [tieredOneOffItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method!
			s.products({ list: [oneOff] }),
		],
		actions: [],
	});

	// 800 total units = 8 packs (1 free + 7 paid)
	// Tier 1: 5 paid packs × $10 = $50
	// Tier 2: 2 paid packs × $5 = $10
	// Total prepaid: $60
	const quantity = 800;
	const tier1Packs = 5;
	const tier2Packs = 2;
	const expectedPrepaidCost = tier1Packs * 10 + tier2Packs * 5; // $60
	const expectedTotal = basePrice + expectedPrepaidCost; // $70

	// 1. Preview attach
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(preview.total).toBe(expectedTotal);

	// 2. Attempt attach - should return payment_url
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
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
		balance: quantity,
		usage: 0,
	});

	// Verify invoice
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotal,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: One-off with checkout_mode: "always" (force checkout even with PM)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on Pro ($20/mo) - already has payment method
 * - Attach one-off credits with checkout_mode: "always"
 *
 * Expected Result:
 * - Returns Stripe Checkout URL even though customer has payment method
 * - Credits granted after checkout completion
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout: one-off with checkout_mode always")}`, async () => {
	const customerId = "stripe-checkout-one-off-always";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const oneOffCreditsItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffCredits = products.oneOff({
		id: "one-off-credits",
		items: [oneOffCreditsItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }), // Has payment method!
			s.products({ list: [pro, oneOffCredits] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Verify Pro is attached
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: pro.id });

	// 1. Preview attach - base ($10) + 100 credits ($10) = $20
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: oneOffCredits.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
	});
	expect(preview.total).toBe(20);

	// 2. Attach with checkout_mode: "always" - should return payment_url
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOffCredits.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
		checkout_mode: "always",
	});

	// Should return checkout URL even though customer has payment method
	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	// 3. Complete checkout
	await completeCheckoutForm(result.payment_url);
	await timeout(12000);

	// 4. Verify credits were granted
	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });
	await expectProductActive({ customer, productId: oneOffCredits.id });

	// Messages: 100 from Pro + 100 from one-off = 200
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});

	// Verify invoices: Pro ($20) + one-off ($20)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 20,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Product with recurring + one-off items
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method
 * - Product has:
 *   - Monthly prepaid words (recurring): $15/pack (100 units)
 *   - One-off messages: $10/pack (100 units)
 *   - Pro base price: $20/month
 *
 * Expected Result:
 * - Checkout includes both recurring subscription + one-time payment
 * - Invoice total: $20 (base) + $15 (words) + $10 (messages) = $45
 * - Words balance = 100 (recurring, resets monthly)
 * - Messages balance = 100 (one-off, never resets)
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout: recurring + one-off combined")}`, async () => {
	const customerId = "stripe-checkout-recurring-oneoff";
	const basePrice = 20;
	const wordsPricePerPack = 15;
	const messagesPricePerPack = 10;
	const billingUnits = 100;

	// Monthly prepaid words (recurring)
	const monthlyWordsItem = items.prepaid({
		featureId: TestFeature.Words,
		includedUsage: 0,
		billingUnits,
		price: wordsPricePerPack,
	});

	// One-off messages
	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits,
		price: messagesPricePerPack,
	});

	const pro = products.pro({
		id: "pro-recurring-oneoff",
		items: [monthlyWordsItem, oneOffMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method!
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// Request 100 units of each feature (1 pack each)
	const wordsQuantity = 100;
	const messagesQuantity = 100;
	const expectedTotal = basePrice + wordsPricePerPack + messagesPricePerPack; // $45

	// 1. Preview attach
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{ feature_id: TestFeature.Words, quantity: wordsQuantity },
			{ feature_id: TestFeature.Messages, quantity: messagesQuantity },
		],
	});
	expect(preview.total).toBe(expectedTotal);

	// 2. Attempt attach - should return payment_url
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{ feature_id: TestFeature.Words, quantity: wordsQuantity },
			{ feature_id: TestFeature.Messages, quantity: messagesQuantity },
		],
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	// 3. Complete checkout
	await completeCheckoutForm(result.payment_url);
	await timeout(12000);

	// 4. Verify product is attached
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: pro.id,
	});

	// Verify words feature (recurring)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		balance: wordsQuantity,
		usage: 0,
	});

	// Verify messages feature (one-off)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: messagesQuantity,
		usage: 0,
	});

	// Verify invoice
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotal,
	});
});
