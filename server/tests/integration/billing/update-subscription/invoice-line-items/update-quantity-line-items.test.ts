/**
 * Update Quantity Invoice Line Items Tests
 *
 * Tests for verifying that invoice line items are correctly persisted to the database
 * when updating quantities via the billing v2 flow.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectInvoiceLineItemsCorrect } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { expectLatestInvoiceCorrect } from "@tests/integration/billing/utils/expectLatestInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Increase quantity - verify line items persisted
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro with prepaid messages (100 initial)
 * - Increase quantity from 100 to 400 (+300)
 *
 * Expected Result:
 * - Invoice created for quantity increase
 * - Invoice line items are persisted to DB:
 *   - Refund for old quantity: 1 pack × $10 = -$10, quantity=100
 *   - Charge for new quantity: 4 packs × $10 = $40, quantity=400
 *   - Net: $30
 * - prorated: true (mid-cycle quantity change)
 * - customer_product_id populated
 */
test.concurrent(`${chalk.yellowBright("update-quantity-line-items 1: increase quantity - line items persisted")}`, async () => {
	const customerId = "update-qty-li-increase";
	const billingUnits = 100;
	const pricePerPack = 10;

	const prepaidMessages = items.prepaidMessages({
		includedUsage: 0,
		billingUnits,
		price: pricePerPack,
	});

	const pro = products.pro({
		id: "pro-prepaid",
		items: [prepaidMessages],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			// Initial attach with 100 messages (1 pack = $10)
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	// Verify initial state
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		balance: 100,
	});

	// Increase from 100 to 400 (+300 = net +3 packs = $30)
	const result = await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 400 }],
	});

	// Verify invoice was created
	expect(result.invoice).toBeDefined();
	expect(result.invoice!.stripe_id).toBeDefined();

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify messages increased
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		balance: 400,
	});

	// Verify invoice total: 4 packs - 1 pack = $40 - $10 = $30
	expectLatestInvoiceCorrect({
		customer: customerAfter,
		productId: pro.id,
		amount: 30,
	});

	// ═══════════════════════════════════════════════════════════════════════════════
	// KEY TEST: Verify invoice line items are persisted to DB
	// ═══════════════════════════════════════════════════════════════════════════════

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: result.invoice!.stripe_id,
		expectedTotal: 30, // 4 packs - 1 pack = $40 - $10 = $30
		expectedLineItems: [
			// Refund for old quantity: 1 pack × $10 = -$10
			{
				featureId: TestFeature.Messages,
				billingTiming: "in_advance",
				totalAmount: -10,
				direction: "refund",
				totalQuantity: 100,
				paidQuantity: 100,
			},
			// Charge for new quantity: 4 packs × $10 = $40
			{
				featureId: TestFeature.Messages,
				billingTiming: "in_advance",
				totalAmount: 40,
				direction: "charge",
				totalQuantity: 400,
				paidQuantity: 400,
			},
		],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Increase quantity with multiple features - verify line items persisted
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro with prepaid messages AND prepaid words
 * - Increase both quantities simultaneously
 *
 * Expected Result:
 * - Invoice line items for both features are persisted:
 *   - Messages: refund 1 pack (-$10, qty=100), charge 3 packs ($30, qty=300) = net $20
 *   - Words: refund 1 pack (-$5, qty=100), charge 4 packs ($20, qty=400) = net $15
 *   - Total: $35
 * - Each feature's line items are correctly attributed
 */
test.concurrent(`${chalk.yellowBright("update-quantity-line-items 2: increase multiple features - line items persisted")}`, async () => {
	const customerId = "update-qty-li-multi-feature";
	const messagesBillingUnits = 100;
	const wordsBillingUnits = 100;
	const messagesPricePerPack = 10;
	const wordsPricePerPack = 5;

	const prepaidMessages = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: messagesBillingUnits,
		price: messagesPricePerPack,
	});

	const prepaidWords = items.prepaid({
		featureId: TestFeature.Words,
		includedUsage: 0,
		billingUnits: wordsBillingUnits,
		price: wordsPricePerPack,
	});

	const pro = products.pro({
		id: "pro-multi-prepaid",
		items: [prepaidMessages, prepaidWords],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			// Initial attach with both features
			s.billing.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 100 },
					{ feature_id: TestFeature.Words, quantity: 100 },
				],
			}),
		],
	});

	// Increase both:
	// Messages: 100 → 300 (refund 1 pack = -$10, charge 3 packs = $30, net = $20)
	// Words: 100 → 400 (refund 1 pack = -$5, charge 4 packs = $20, net = $15)
	// Total: $35
	const result = await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 300 },
			{ feature_id: TestFeature.Words, quantity: 400 },
		],
	});

	// Verify invoice was created
	expect(result.invoice).toBeDefined();
	expect(result.invoice!.stripe_id).toBeDefined();

	// ═══════════════════════════════════════════════════════════════════════════════
	// KEY TEST: Verify invoice line items are persisted to DB
	// ═══════════════════════════════════════════════════════════════════════════════

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: result.invoice!.stripe_id,
		expectedTotal: 35, // $20 (messages) + $15 (words)
		expectedLineItems: [
			// Messages: refund 1 pack × $10 = -$10
			{
				featureId: TestFeature.Messages,
				billingTiming: "in_advance",
				totalAmount: -10,
				direction: "refund",
				totalQuantity: 100,
				paidQuantity: 100,
			},
			// Messages: charge 3 packs × $10 = $30
			{
				featureId: TestFeature.Messages,
				billingTiming: "in_advance",
				totalAmount: 30,
				direction: "charge",
				totalQuantity: 300,
				paidQuantity: 300,
			},
			// Words: refund 1 pack × $5 = -$5
			{
				featureId: TestFeature.Words,
				billingTiming: "in_advance",
				totalAmount: -5,
				direction: "refund",
				totalQuantity: 100,
				paidQuantity: 100,
			},
			// Words: charge 4 packs × $5 = $20
			{
				featureId: TestFeature.Words,
				billingTiming: "in_advance",
				totalAmount: 20,
				direction: "charge",
				totalQuantity: 400,
				paidQuantity: 400,
			},
		],
	});
});
