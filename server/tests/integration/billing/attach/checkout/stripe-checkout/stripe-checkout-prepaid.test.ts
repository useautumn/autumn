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
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutForm } from "@tests/utils/browserPool";
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
 * - Attach pro with prepaid messages (quantity: 200)
 *
 * Expected Result:
 * - Checkout includes base price + prepaid line item
 * - 200 credits granted after checkout
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout: prepaid quantity")}`, async () => {
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
test.concurrent(`${chalk.yellowBright("stripe-checkout: prepaid quantity updated on checkout")}`, async () => {
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
	const checkoutStripePacks = checkoutTotalUnits / billingUnits; // 5 packs on Stripe
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
// TEST 3: Multiple prepaid features with quantity update
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method
 * - Attach pro with prepaid messages AND prepaid words
 * - On Stripe checkout page, update quantity (messages line item)
 *
 * Note: completeStripeCheckoutForm only adjusts the first adjustable line item.
 * Words quantity remains as originally set.
 *
 * Expected Result:
 * - Messages reflects updated checkout quantity
 * - Words reflects original attach quantity
 * - Invoice reflects both features correctly
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout: multiple prepaid features with quantity update")}`, async () => {
	const customerId = "stripe-checkout-multi-prepaid";
	const billingUnits = 100;
	const basePrice = 20;

	// Messages: 100 included, $10/pack
	const messagesIncluded = 100;
	const messagesPricePerPack = 10;
	const prepaidMessagesItem = items.prepaidMessages({
		includedUsage: messagesIncluded,
		billingUnits,
		price: messagesPricePerPack,
	});

	// Words: 200 included, $5/pack (includedUsage must be multiple of billingUnits)
	const wordsIncluded = 200;
	const wordsPricePerPack = 5;
	const prepaidWordsItem = items.prepaid({
		featureId: TestFeature.Words,
		includedUsage: wordsIncluded,
		billingUnits,
		price: wordsPricePerPack,
	});

	const pro = products.pro({
		id: "pro-multi-prepaid",
		items: [prepaidMessagesItem, prepaidWordsItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: true }), s.products({ list: [pro] })],
		actions: [],
	});

	// 1. Attach with initial quantities
	const initialMessagesQty = 300; // 3 packs, 2 paid
	const initialWordsQty = 300; // 3 packs, 1 paid (200 included)
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: initialMessagesQty,
				adjustable: true,
			},
			{
				feature_id: TestFeature.Words,
				quantity: initialWordsQty,
				adjustable: true,
			},
		],
	});

	expect(result.payment_url).toBeDefined();

	// 2. Complete checkout with updated messages quantity (5 packs = 500 total)
	const checkoutMessagesTotalUnits = 500;
	const checkoutMessagesStripePacks = checkoutMessagesTotalUnits / billingUnits; // 5 packs
	await completeStripeCheckoutForm({
		url: result.payment_url,
		overrideQuantity: checkoutMessagesStripePacks,
	});
	await timeout(12000);

	// 3. Verify both features
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: pro.id,
	});

	// Messages: updated to 500
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: checkoutMessagesTotalUnits,
		balance: checkoutMessagesTotalUnits,
		usage: 0,
	});

	// Words: remains at original (300 units, 1 paid pack since 200 included)
	const wordsRoundedQty = initialWordsQty; // 300 (already a multiple of billingUnits)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: wordsRoundedQty,
		balance: wordsRoundedQty,
		usage: 0,
	});

	// 4. Verify invoice
	const messagesPaidPacks =
		(checkoutMessagesTotalUnits - messagesIncluded) / billingUnits; // 4
	const wordsPaidPacks = (wordsRoundedQty - wordsIncluded) / billingUnits; // (300 - 200) / 100 = 1
	const expectedTotal =
		basePrice +
		messagesPaidPacks * messagesPricePerPack +
		wordsPaidPacks * wordsPricePerPack;

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotal,
	});

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
 * - Customer only gets included usage (100), not the requested 300
 * - Invoice: $20 base only (no prepaid charges)
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout: prepaid quantity set to 0")}`, async () => {
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
		includedUsage: 0, // Only 100, not 300
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

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Tiered prepaid with quantity updated on checkout
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method
 * - Attach pro with tiered prepaid messages (quantity: 300)
 * - On Stripe checkout page, update quantity to 8 packs (800 total)
 *
 * Tiered pricing: 0-500 at $10/pack, 501-1000 at $5/pack (100 units/pack)
 *
 * After checkout override to 800 units (8 packs):
 * - Tier 1: 5 packs × $10 = $50
 * - Tier 2: 3 packs × $5 = $15
 * - Total prepaid: $65
 *
 * Expected Result:
 * - Final state reflects checkout quantity (800)
 * - Invoice: $20 base + $65 tiered prepaid = $85
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout: tiered prepaid with quantity update")}`, async () => {
	const customerId = "stripe-checkout-tiered-prepaid";
	const billingUnits = 100;
	const basePrice = 20;

	// Tiered pricing: 0-500 at $10/pack, 501+ at $5/pack (last tier must be "inf" for Stripe)
	const tieredPrepaidItem = items.tieredPrepaidMessages({
		includedUsage: 0,
		billingUnits,
		tiers: [
			{ to: 500, amount: 10 },
			{ to: "inf", amount: 5 },
		],
	});

	const pro = products.pro({
		id: "pro-tiered-checkout",
		items: [tieredPrepaidItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: true }), s.products({ list: [pro] })],
		actions: [],
	});

	// 1. Attach with initial quantity 300 (3 packs, all tier 1)
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

	// 2. Complete checkout with 8 packs (800 units, spans both tiers)
	const checkoutTotalUnits = 800;
	const checkoutStripePacks = checkoutTotalUnits / billingUnits; // 8 packs
	await completeStripeCheckoutForm({
		url: result.payment_url,
		overrideQuantity: checkoutStripePacks,
	});
	await timeout(12000);

	// 3. Verify product attached with checkout quantity
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

	// 4. Verify invoice with tiered pricing
	// Tier 1: 5 packs × $10 = $50
	// Tier 2: 3 packs × $5 = $15
	// Total prepaid: $65
	const expectedPrepaidCost = 5 * 10 + 3 * 5; // $65
	const expectedTotal = basePrice + expectedPrepaidCost; // $85

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotal,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
