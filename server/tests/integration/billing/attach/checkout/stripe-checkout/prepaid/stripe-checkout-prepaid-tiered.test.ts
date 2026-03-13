/**
 * Stripe Checkout Prepaid Tests — Multi-Feature & Tiered Pricing
 *
 * Tests 3, 5, 6 from the original stripe-checkout-prepaid.test.ts:
 * - Multiple prepaid features with quantity update
 * - Tiered prepaid with quantity update on checkout
 * - Volume prepaid with tiered pricing
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
test.concurrent(`${chalk.yellowBright("stripe-checkout-prepaid-tiered 1: multiple prepaid features with quantity update")}`, async () => {
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
// TEST 5: Tiered prepaid with quantity updated on checkout
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method
 * - Attach pro with tiered prepaid messages (quantity: 300)
 * - On Stripe checkout page, update quantity to 8 packs (800 total)
 *
 * Tiered pricing: 0-500 at $10/pack, 501+ at $5/pack (100 units/pack)
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
test.concurrent(`${chalk.yellowBright("stripe-checkout-prepaid-tiered 2: tiered prepaid with quantity update")}`, async () => {
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

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Prepaid volume with tiered pricing
// ═══════════════════════════════════════════════════════════════════════════════

const VOLUME_TIERS: { to: number | "inf"; amount: number }[] = [
	{ to: 500, amount: 30 },
	{ to: 1500, amount: 50 },
	{ to: "inf", amount: 70 },
];
const BASE_PRICE = 20;

test.concurrent(`${chalk.yellowBright("stripe-checkout-prepaid-tiered 3: prepaid volume: 300 units, 100 included, tier 1 → $30")}`, async () => {
	const customerId = "attach-prepaid-volume-included-tier1";
	const quantity = 300;
	const includedUsage = 100;

	const expectedPrepaidCost = 90;

	const volumeItem = items.volumePrepaidMessages({
		includedUsage,
		tiers: VOLUME_TIERS,
	});

	const pro = products.pro({
		id: "pro-volume-included-tier1",
		items: [volumeItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [pro] })],
		actions: [],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(preview.total).toBe(BASE_PRICE + expectedPrepaidCost);

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
		redirect_mode: "if_required",
	});
	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	await completeStripeCheckoutForm({ url: result.payment_url });

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: pro.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: quantity,
		balance: quantity,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: BASE_PRICE + expectedPrepaidCost,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
