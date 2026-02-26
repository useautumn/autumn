/**
 * Update Quantity Misc Tests
 *
 * Tests for miscellaneous quantity update scenarios including invoice line item persistence.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectLatestInvoiceCorrect } from "@tests/integration/billing/utils/expectLatestInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { invoiceLineItemRepo } from "@/internal/invoices/lineItems/repos";

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
 * - Invoice line items are persisted to DB
 * - Line items show prepaid charges for +3 packs ($30)
 * - prorated: true (mid-cycle quantity change)
 * - customer_product_id populated
 */
test.concurrent(`${chalk.yellowBright("update-quantity-misc 1: increase quantity - line items persisted")}`, async () => {
	const customerId = "update-qty-line-items-increase";
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

	// Increase from 100 to 400 (+300 = +3 packs = $30)
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

	// Verify invoice total: +3 packs × $10 = $30
	expectLatestInvoiceCorrect({
		customer: customerAfter,
		productId: pro.id,
		amount: 30,
	});

	// ═══════════════════════════════════════════════════════════════════════════════
	// KEY TEST: Verify invoice line items are persisted to DB
	// ═══════════════════════════════════════════════════════════════════════════════

	const lineItems = await invoiceLineItemRepo.getByStripeInvoiceId({
		db: ctx.db,
		stripeInvoiceId: result.invoice!.stripe_id,
	});

	// Should have line items for the quantity increase
	expect(lineItems.length).toBeGreaterThan(0);

	// Verify each line item has required fields populated
	for (const lineItem of lineItems) {
		// Core fields
		expect(lineItem.id).toBeDefined();
		expect(lineItem.id.startsWith("invoice_li_")).toBe(true);
		expect(lineItem.stripe_invoice_id).toBe(result.invoice!.stripe_id);
		expect(lineItem.stripe_invoice_id).toBeDefined();

		// Amount fields
		expect(typeof lineItem.amount).toBe("number");
		expect(typeof lineItem.amount_after_discounts).toBe("number");
		expect(lineItem.currency).toBe("usd");

		// Direction field - all should be charges for quantity increase
		expect(lineItem.direction).toBe("charge");

		// Product relationship
		expect(lineItem.product_id).toBeDefined();
		expect(lineItem.price_id).toBeDefined();

		// Feature relationship for prepaid
		expect(lineItem.feature_id).toBe(TestFeature.Messages);
		expect(lineItem.billing_timing).toBe("in_advance");

		// Customer product relationship should be populated
		expect(lineItem.customer_product_id).toBeDefined();
	}

	// Verify total matches expected: $30 for 3 packs
	const lineItemsTotal = lineItems.reduce((sum, li) => sum + li.amount, 0);
	expect(lineItemsTotal).toBe(30);

	// Log for debugging
	console.log(`Line items count: ${lineItems.length}`);
	console.log(
		`Line items: ${JSON.stringify(
			lineItems.map((li) => ({
				id: li.id,
				feature_id: li.feature_id,
				amount: li.amount,
				description: li.description,
				prorated: li.prorated,
				customer_product_id: li.customer_product_id,
			})),
			null,
			2,
		)}`,
	);
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
 * - Invoice line items for both features are persisted
 * - Each feature's line items are correctly attributed
 */
test.concurrent(`${chalk.yellowBright("update-quantity-misc 2: increase multiple features - line items persisted")}`, async () => {
	const customerId = "update-qty-line-items-multi-feature";
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
	// Messages: 100 → 300 (+2 packs × $10 = $20)
	// Words: 100 → 400 (+3 packs × $5 = $15)
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

	const lineItems = await invoiceLineItemRepo.getByStripeInvoiceId({
		db: ctx.db,
		stripeInvoiceId: result.invoice!.stripe_id,
	});

	// Should have line items for both features
	expect(lineItems.length).toBeGreaterThan(0);

	// Verify messages line items
	const messagesItems = lineItems.filter(
		(li) => li.feature_id === TestFeature.Messages,
	);
	expect(messagesItems.length).toBeGreaterThan(0);
	const messagesTotal = messagesItems.reduce((sum, li) => sum + li.amount, 0);
	expect(messagesTotal).toBe(20); // 2 packs × $10

	// Verify words line items
	const wordsItems = lineItems.filter(
		(li) => li.feature_id === TestFeature.Words,
	);
	expect(wordsItems.length).toBeGreaterThan(0);
	const wordsTotal = wordsItems.reduce((sum, li) => sum + li.amount, 0);
	expect(wordsTotal).toBe(15); // 3 packs × $5

	// Verify total matches expected: $35
	const lineItemsTotal = lineItems.reduce((sum, li) => sum + li.amount, 0);
	expect(lineItemsTotal).toBe(35);

	// Verify each line item has required fields
	for (const lineItem of lineItems) {
		expect(lineItem.id).toBeDefined();
		expect(lineItem.id.startsWith("invoice_li_")).toBe(true);
		expect(lineItem.product_id).toBeDefined();
		expect(lineItem.price_id).toBeDefined();
		expect(lineItem.customer_product_id).toBeDefined();
		expect(lineItem.billing_timing).toBe("in_advance");
	}

	// Log for debugging
	console.log(`Line items count: ${lineItems.length}`);
	console.log(
		`Messages items: ${messagesItems.length}, total: ${messagesTotal}`,
	);
	console.log(`Words items: ${wordsItems.length}, total: ${wordsTotal}`);
});
