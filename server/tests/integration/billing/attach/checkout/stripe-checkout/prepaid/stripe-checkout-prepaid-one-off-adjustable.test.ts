/**
 * Stripe Checkout Prepaid Tests — One-Off Adjustable Quantity
 *
 * Tests that `adjustable: true` works correctly for one-off prepaid products
 * on Stripe Checkout (mode: "payment"). Previously, adjustable quantity was
 * only supported for recurring prepaid items.
 *
 * Tests:
 * 1. One-off flat-rate prepaid with adjustable: true — quantity override on checkout
 * 2. One-off flat-rate prepaid with adjustable: false — no quantity override
 * 3. One-off flat-rate prepaid with adjustable: true — no override (use original quantity)
 * 4. One-off tiered prepaid with adjustable: true — adjustable ignored (tiered uses pre-computed price_data)
 * 5. Multiple one-off features, only some adjustable
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: One-off flat-rate prepaid with adjustable: true — override quantity
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method
 * - One-off add-on product with flat-rate prepaid messages ($10/100 units)
 * - Attach with quantity: 300, adjustable: true
 * - On Stripe checkout page, override quantity to 5 packs (500 units)
 *
 * Expected Result:
 * - Checkout allows adjusting quantity (adjustable_quantity.enabled = true)
 * - Final balance reflects overridden quantity (500), not original (300)
 * - Invoice: $10 base + 5 packs × $10 = $60
 */
test.concurrent(`${chalk.yellowBright("one-off prepaid adjustable 1: flat-rate quantity override on checkout")}`, async () => {
	const customerId = "one-off-prepaid-adjustable-override";
	const billingUnits = 100;
	const pricePerPack = 10;
	const basePrice = 10; // products.oneOff() adds a $10 one-off base price

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits,
		price: pricePerPack,
	});

	const oneOffProduct = products.oneOff({
		id: "one-off-adjustable",
		items: [oneOffMessagesItem],
		isAddOn: true,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [oneOffProduct] }),
		],
		actions: [],
	});

	// 1. Attach with adjustable: true
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOffProduct.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: 300,
				adjustable: true,
			},
		],
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	// 2. Override quantity to 5 packs (500 units) on checkout page
	const overridePacks = 5;
	await completeStripeCheckoutForm({
		url: result.payment_url,
		overrideQuantity: overridePacks,
	});
	await timeout(12000);

	// 3. Verify balance reflects overridden quantity
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: oneOffProduct.id,
	});

	const expectedUnits = overridePacks * billingUnits; // 500
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: expectedUnits,
		balance: expectedUnits,
		usage: 0,
	});

	// 4. Verify invoice: $10 base + 5 packs × $10 = $60
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: basePrice + overridePacks * pricePerPack,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: One-off flat-rate prepaid with adjustable: false — no quantity selector
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method
 * - One-off add-on with flat-rate prepaid messages ($10/100 units)
 * - Attach with quantity: 300, adjustable: false (explicit)
 *
 * Expected Result:
 * - Checkout does NOT show adjustable quantity selector
 * - Final balance = 300 (original quantity)
 * - Invoice: $10 base + 3 packs × $10 = $40
 */
test.concurrent(`${chalk.yellowBright("one-off prepaid adjustable 2: flat-rate adjustable false — no quantity selector")}`, async () => {
	const customerId = "one-off-prepaid-not-adjustable";
	const billingUnits = 100;
	const pricePerPack = 10;
	const basePrice = 10; // products.oneOff() adds a $10 one-off base price
	const quantity = 300;

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits,
		price: pricePerPack,
	});

	const oneOffProduct = products.oneOff({
		id: "one-off-not-adjustable",
		items: [oneOffMessagesItem],
		isAddOn: true,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [oneOffProduct] }),
		],
		actions: [],
	});

	// 1. Attach with adjustable: false
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOffProduct.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity,
				adjustable: false,
			},
		],
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	// 2. Complete checkout without overriding quantity
	await completeStripeCheckoutForm({ url: result.payment_url });

	// 3. Verify balance = original quantity
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: oneOffProduct.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: quantity,
		balance: quantity,
		usage: 0,
	});

	// 4. Verify invoice: $10 base + 3 packs × $10 = $40
	const packs = quantity / billingUnits;
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: basePrice + packs * pricePerPack,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: One-off flat-rate prepaid with adjustable: true — use original quantity
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method
 * - One-off add-on with flat-rate prepaid messages ($10/100 units)
 * - Attach with quantity: 300, adjustable: true
 * - Do NOT override quantity on checkout page
 *
 * Expected Result:
 * - Checkout shows adjustable quantity but user doesn't change it
 * - Final balance = 300 (original quantity)
 * - Invoice: $10 base + 3 packs × $10 = $40
 */
test.concurrent(`${chalk.yellowBright("one-off prepaid adjustable 3: flat-rate adjustable true — no override, uses original quantity")}`, async () => {
	const customerId = "one-off-prepaid-adjustable-no-override";
	const billingUnits = 100;
	const pricePerPack = 10;
	const basePrice = 10; // products.oneOff() adds a $10 one-off base price
	const quantity = 300;

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits,
		price: pricePerPack,
	});

	const oneOffProduct = products.oneOff({
		id: "one-off-adj-no-override",
		items: [oneOffMessagesItem],
		isAddOn: true,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [oneOffProduct] }),
		],
		actions: [],
	});

	// 1. Attach with adjustable: true
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOffProduct.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity,
				adjustable: true,
			},
		],
	});

	expect(result.payment_url).toBeDefined();

	// 2. Complete checkout WITHOUT overriding quantity
	await completeStripeCheckoutForm({ url: result.payment_url });

	// 3. Verify balance = original quantity
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: oneOffProduct.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: quantity,
		balance: quantity,
		usage: 0,
	});

	// 4. Verify invoice: $10 base + 3 packs × $10 = $40
	const packs = quantity / billingUnits;
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: basePrice + packs * pricePerPack,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: One-off tiered prepaid with adjustable: true — adjustable ignored
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method
 * - One-off tiered prepaid messages (graduated pricing)
 * - Attach with quantity: 300, adjustable: true
 *
 * Expected Result:
 * - Tiered one-off items use inline price_data with quantity: 1 (pre-computed total)
 * - adjustable: true is silently ignored (no adjustable_quantity on checkout)
 * - Final balance = 300
 * - Invoice: $10 base + 3 packs in tier 1 × $10 = $40
 */
test.concurrent(`${chalk.yellowBright("one-off prepaid adjustable 4: tiered one-off — adjustable ignored (pre-computed price_data)")}`, async () => {
	const customerId = "one-off-prepaid-tiered-adjustable-ignored";
	const billingUnits = 100;
	const quantity = 300;

	const tieredOneOffItem = items.tieredOneOffMessages({
		includedUsage: 0,
		billingUnits,
		tiers: [
			{ to: 500, amount: 10 },
			{ to: "inf", amount: 5 },
		],
	});

	const oneOffProduct = products.oneOff({
		id: "one-off-tiered-adj",
		items: [tieredOneOffItem],
		isAddOn: true,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [oneOffProduct] }),
		],
		actions: [],
	});

	// 1. Attach with adjustable: true (should be ignored for tiered)
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOffProduct.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity,
				adjustable: true,
			},
		],
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	// 2. Complete checkout — no overrideQuantity since adjustable is ignored
	await completeStripeCheckoutForm({ url: result.payment_url });

	// 3. Verify balance = 300
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: oneOffProduct.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: quantity,
		balance: quantity,
		usage: 0,
	});

	// 4. Verify invoice: $10 base + 3 packs in tier 1 × $10 = $40
	const basePrice = 10; // products.oneOff() adds a $10 one-off base price
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: basePrice + 30,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Multiple one-off features, only some adjustable
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method
 * - One-off product with two prepaid features: messages (adjustable) and words (not adjustable)
 * - Attach with messages adjustable: true, words adjustable: false
 * - Override messages quantity on checkout
 *
 * Expected Result:
 * - Only messages has adjustable quantity on checkout
 * - Messages balance reflects overridden quantity
 * - Words balance reflects original quantity (not adjustable)
 */
test.concurrent(`${chalk.yellowBright("one-off prepaid adjustable 5: multiple features — only messages adjustable, words fixed")}`, async () => {
	const customerId = "one-off-prepaid-multi-feature-adj";
	const billingUnits = 100;
	const pricePerPack = 10;

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits,
		price: pricePerPack,
	});

	const oneOffWordsItem = items.oneOffWords({
		includedUsage: 0,
		billingUnits,
		price: pricePerPack,
	});

	const oneOffProduct = products.base({
		id: "one-off-multi-adj",
		items: [oneOffMessagesItem, oneOffWordsItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [oneOffProduct] }),
		],
		actions: [],
	});

	const messagesQuantity = 300;
	const wordsQuantity = 200;

	// 1. Attach with messages adjustable, words not
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOffProduct.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: messagesQuantity,
				adjustable: true,
			},
			{
				feature_id: TestFeature.Words,
				quantity: wordsQuantity,
				adjustable: false,
			},
		],
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	// 2. Override messages quantity to 5 packs (500 units)
	const overridePacks = 5;
	await completeStripeCheckoutForm({
		url: result.payment_url,
		overrideQuantity: overridePacks,
	});
	await timeout(12000);

	// 3. Verify messages balance reflects overridden quantity
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: oneOffProduct.id,
	});

	const expectedMessagesUnits = overridePacks * billingUnits; // 500
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: expectedMessagesUnits,
		balance: expectedMessagesUnits,
		usage: 0,
	});

	// 4. Words should remain at original quantity (not adjustable)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: wordsQuantity,
		balance: wordsQuantity,
		usage: 0,
	});
});
