/**
 * Multi-Attach Invoice Line Items Tests
 *
 * Tests for verifying that invoice line items are correctly persisted to the database
 * when attaching multiple products via multi-attach (both direct and checkout flows).
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectInvoiceLineItemsCorrect } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Multi-attach checkout - Pro + Recurring Add-on - verify line items
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method
 * - Multi-attach:
 *   - Pro ($20/mo) with prepaid messages (100 included, 200 total = 1 paid pack @ $10)
 *   - Recurring add-on ($20/mo) with monthly words (100 included)
 * - Complete Stripe Checkout
 *
 * Expected Result:
 * - Both products attached
 * - Invoice total: $20 (pro) + $10 (prepaid) + $20 (addon) = $50
 * - Line items:
 *   - Pro base price ($20)
 *   - Prepaid messages ($10)
 *   - Addon base price ($20)
 */
test.concurrent(`${chalk.yellowBright("multi-attach-line-items 1: checkout - pro + recurring add-on")}`, async () => {
	const customerId = "ma-li-checkout-pro-addon";

	const prepaidMessages = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
	});
	const monthlyWords = items.monthlyWords({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro-ma-li",
		items: [prepaidMessages],
	});
	const addon = products.recurringAddOn({
		id: "addon-ma-li",
		items: [monthlyWords],
	});

	const messagesQuantity = 200; // 100 included + 100 prepaid (1 pack)
	const proBasePrice = 20;
	const prepaidPrice = 10; // 1 pack × $10
	const addonBasePrice = 20;
	const expectedTotal = proBasePrice + prepaidPrice + addonBasePrice; // $50

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method - triggers checkout
			s.products({ list: [pro, addon] }),
		],
		actions: [],
	});

	// 1. Preview multi-attach
	const preview = await autumnV1.billing.previewMultiAttach({
		customer_id: customerId,
		plans: [
			{
				plan_id: pro.id,
				feature_quantities: [
					{ feature_id: TestFeature.Messages, quantity: messagesQuantity },
				],
			},
			{ plan_id: addon.id },
		],
	});
	expect(preview.total).toBeCloseTo(expectedTotal, 0);

	// 2. Multi-attach - returns checkout URL
	const result = await autumnV1.billing.multiAttach(
		{
			customer_id: customerId,
			plans: [
				{
					plan_id: pro.id,
					feature_quantities: [
						{ feature_id: TestFeature.Messages, quantity: messagesQuantity },
					],
				},
				{ plan_id: addon.id },
			],
		},
		{ timeout: 0 },
	);

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	// 3. Complete checkout
	await completeStripeCheckoutForm({ url: result.payment_url });
	await timeout(12000);

	// 4. Verify both products attached
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id, addon.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: messagesQuantity,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		balance: 100,
	});

	// 5. Verify invoice total
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotal,
	});

	const latestInvoice = customer.invoices?.[0];
	expect(latestInvoice?.stripe_id).toBeDefined();

	// ═══════════════════════════════════════════════════════════════════════════════
	// KEY TEST: Verify invoice line items are persisted to DB
	// ═══════════════════════════════════════════════════════════════════════════════

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: latestInvoice!.stripe_id,
		expectedTotal,
		allCharges: true,
		expectedLineItems: [
			// Pro base price ($20)
			{ isBasePrice: true, productId: pro.id, minCount: 1 },
			// Addon base price ($20)
			{ isBasePrice: true, productId: addon.id, minCount: 1 },
			// Prepaid messages (1 pack × $10)
			{
				featureId: TestFeature.Messages,
				totalAmount: prepaidPrice,
				billingTiming: "in_advance",
			},
		],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Multi-attach checkout - Two products from different groups
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method
 * - Multi-attach two products from different groups:
 *   - Plan A ($20/mo) - group: default - with messages
 *   - Plan B ($30/mo) - group: "group-b" - with users (allocated, 3 included)
 * - Create 5 entities for users feature (2 overage)
 * - Complete Stripe Checkout
 *
 * Expected Result:
 * - Both products attached (different groups, so both can coexist)
 * - Invoice total: $20 + $30 + $20 (allocated overage) = $70
 * - Line items for both base prices + allocated overage
 */
test.concurrent(`${chalk.yellowBright("multi-attach-line-items 2: checkout - two products different groups")}`, async () => {
	const customerId = "ma-li-checkout-diff-groups";

	const monthlyMessages = items.monthlyMessages({ includedUsage: 100 });
	const allocatedUsers = items.allocatedUsers({ includedUsage: 3 });

	const planA = products.pro({
		id: "plan-a-li",
		items: [monthlyMessages],
	});
	const planB = products.base({
		id: "plan-b-li",
		items: [allocatedUsers, items.monthlyPrice({ price: 30 })],
		group: "group-b",
	});

	const planABasePrice = 20;
	const planBBasePrice = 30;
	const allocatedPrice = 20; // 2 overage × $10
	const expectedTotal = planABasePrice + planBBasePrice + allocatedPrice; // $70

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method
			s.products({ list: [planA, planB] }),
			s.entities({ count: 5, featureId: TestFeature.Users }), // 5 users, 2 over included
		],
		actions: [],
	});

	// 1. Multi-attach - returns checkout URL
	const result = await autumnV1.billing.multiAttach(
		{
			customer_id: customerId,
			plans: [{ plan_id: planA.id }, { plan_id: planB.id }],
		},
		{ timeout: 0 },
	);

	expect(result.payment_url).toBeDefined();

	// 2. Complete checkout
	await completeStripeCheckoutForm({ url: result.payment_url });
	await timeout(12000);

	// 3. Verify both products attached
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [planA.id, planB.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 100,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		usage: 5,
	});

	// 4. Verify invoice
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotal,
	});

	const latestInvoice = customer.invoices?.[0];
	expect(latestInvoice?.stripe_id).toBeDefined();

	// ═══════════════════════════════════════════════════════════════════════════════
	// KEY TEST: Verify invoice line items
	// ═══════════════════════════════════════════════════════════════════════════════

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: latestInvoice!.stripe_id,
		expectedTotal,
		allCharges: true,
		expectedLineItems: [
			// Plan A base price ($20)
			{ isBasePrice: true, productId: planA.id, minCount: 1 },
			// Plan B base price ($30)
			{ isBasePrice: true, productId: planB.id, minCount: 1 },
			// Allocated users overage (2 × $10 = $20)
			{
				featureId: TestFeature.Users,
				totalAmount: allocatedPrice,
			},
		],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Multi-attach direct billing - Pro + Add-on with prepaid - verify line items
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer WITH payment method (direct billing, not checkout)
 * - Multi-attach:
 *   - Pro ($20/mo) with prepaid messages (300 total, 100 included = 2 paid packs @ $10)
 *   - Recurring add-on ($20/mo) with prepaid words (200 total, 0 included = 2 packs @ $5)
 * - Direct charge
 *
 * Expected Result:
 * - Invoice total: $20 + $20 (prepaid msgs) + $20 (addon) + $10 (prepaid words) = $70
 * - Line items for all base prices + prepaid features
 */
test.concurrent(`${chalk.yellowBright("multi-attach-line-items 3: direct billing - pro + addon with prepaid")}`, async () => {
	const customerId = "ma-li-direct-prepaid";

	const prepaidMessages = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
	});
	const prepaidWords = items.prepaid({
		featureId: TestFeature.Words,
		includedUsage: 0,
		billingUnits: 100,
		price: 5,
	});

	const pro = products.pro({
		id: "pro-direct-li",
		items: [prepaidMessages],
	});
	const addon = products.recurringAddOn({
		id: "addon-direct-li",
		items: [prepaidWords],
	});

	const messagesQuantity = 300; // 100 included + 200 prepaid (2 packs)
	const wordsQuantity = 200; // 0 included + 200 prepaid (2 packs)
	const proBasePrice = 20;
	const msgPrepaidPrice = 20; // 2 packs × $10
	const addonBasePrice = 20;
	const wordsPrepaidPrice = 10; // 2 packs × $5
	const expectedTotal =
		proBasePrice + msgPrepaidPrice + addonBasePrice + wordsPrepaidPrice; // $70

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }), // Has payment method - direct billing
			s.products({ list: [pro, addon] }),
		],
		actions: [],
	});

	// 1. Preview
	const preview = await autumnV1.billing.previewMultiAttach({
		customer_id: customerId,
		plans: [
			{
				plan_id: pro.id,
				feature_quantities: [
					{ feature_id: TestFeature.Messages, quantity: messagesQuantity },
				],
			},
			{
				plan_id: addon.id,
				feature_quantities: [
					{ feature_id: TestFeature.Words, quantity: wordsQuantity },
				],
			},
		],
	});
	expect(preview.total).toBeCloseTo(expectedTotal, 0);

	// 2. Multi-attach (direct billing)
	const result = await autumnV1.billing.multiAttach({
		customer_id: customerId,
		plans: [
			{
				plan_id: pro.id,
				feature_quantities: [
					{ feature_id: TestFeature.Messages, quantity: messagesQuantity },
				],
			},
			{
				plan_id: addon.id,
				feature_quantities: [
					{ feature_id: TestFeature.Words, quantity: wordsQuantity },
				],
			},
		],
	});

	// Direct billing should return invoice, not payment_url
	expect(result.invoice).toBeDefined();
	expect(result.invoice!.stripe_id).toBeDefined();

	// 3. Verify products attached
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id, addon.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: messagesQuantity,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		balance: wordsQuantity,
	});

	// 4. Verify invoice
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotal,
	});

	// ═══════════════════════════════════════════════════════════════════════════════
	// KEY TEST: Verify invoice line items
	// ═══════════════════════════════════════════════════════════════════════════════

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: result.invoice!.stripe_id,
		expectedTotal,
		allCharges: true,
		expectedLineItems: [
			// Pro base price ($20)
			{ isBasePrice: true, productId: pro.id, minCount: 1 },
			// Addon base price ($20)
			{ isBasePrice: true, productId: addon.id, minCount: 1 },
			// Prepaid messages (2 packs × $10 = $20)
			{
				featureId: TestFeature.Messages,
				totalAmount: msgPrepaidPrice,
				billingTiming: "in_advance",
			},
			// Prepaid words (2 packs × $5 = $10)
			{
				featureId: TestFeature.Words,
				totalAmount: wordsPrepaidPrice,
				billingTiming: "in_advance",
			},
		],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Multi-attach checkout - One-off add-on + recurring - verify line items
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method
 * - Multi-attach:
 *   - Pro ($20/mo) with monthly messages
 *   - One-off add-on ($10) with dashboard feature
 * - Complete Stripe Checkout
 *
 * Expected Result:
 * - Invoice total: $20 + $10 = $30
 * - Line items for both products
 */
test.concurrent(`${chalk.yellowBright("multi-attach-line-items 4: checkout - one-off addon + recurring")}`, async () => {
	const customerId = "ma-li-checkout-oneoff";

	const monthlyMessages = items.monthlyMessages({ includedUsage: 200 });
	const dashboardItem = items.dashboard();

	const pro = products.pro({
		id: "pro-oneoff-li",
		items: [monthlyMessages],
	});
	const oneOffAddon = products.oneOffAddOn({
		id: "oneoff-addon-li",
		items: [dashboardItem],
	});

	const proBasePrice = 20;
	const oneOffPrice = 10;
	const expectedTotal = proBasePrice + oneOffPrice; // $30

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method
			s.products({ list: [pro, oneOffAddon] }),
		],
		actions: [],
	});

	// 1. Multi-attach - returns checkout URL
	const result = await autumnV1.billing.multiAttach(
		{
			customer_id: customerId,
			plans: [{ plan_id: pro.id }, { plan_id: oneOffAddon.id }],
		},
		{ timeout: 0 },
	);

	expect(result.payment_url).toBeDefined();

	// 2. Complete checkout
	await completeStripeCheckoutForm({ url: result.payment_url });
	await timeout(12000);

	// 3. Verify products attached
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id, oneOffAddon.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
	});

	// 4. Verify invoice
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotal,
	});

	const latestInvoice = customer.invoices?.[0];
	expect(latestInvoice?.stripe_id).toBeDefined();

	// ═══════════════════════════════════════════════════════════════════════════════
	// KEY TEST: Verify invoice line items
	// ═══════════════════════════════════════════════════════════════════════════════

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: latestInvoice!.stripe_id,
		expectedTotal,
		allCharges: true,
		expectedLineItems: [
			// Pro base price ($20)
			{ isBasePrice: true, productId: pro.id, minCount: 1 },
			// One-off addon price ($10)
			{ isBasePrice: true, productId: oneOffAddon.id, minCount: 1 },
		],
	});
});
