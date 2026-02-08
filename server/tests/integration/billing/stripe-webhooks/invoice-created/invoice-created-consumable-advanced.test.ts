/**
 * Invoice Created Webhook Tests - Consumable Prices (Advanced)
 *
 * Tests for handling the `invoice.created` Stripe webhook event for consumable
 * (usage-in-arrear) prices. Covers multi-track accumulation, multiple features,
 * and invoice total verification.
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, InvoiceStatus } from "@autumn/shared";
import { calculateExpectedInvoiceAmount } from "@tests/integration/billing/utils/calculateExpectedInvoiceAmount";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { InvoiceService } from "@/internal/invoices/InvoiceService";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Multiple track calls accumulate decimal overage
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro with consumable messages (100 included, $0.10/unit overage)
 * - Track 50.3 + 30.7 + 25.5 = 106.5 total (6.5 overage)
 * - Advance to next billing cycle
 *
 * Expected Result:
 * - Total usage: 106.5, overage: 6.5
 * - Overage charge: 6.5 * $0.10 = $0.65
 * - Total second invoice: $20 base + $0.65 overage = $20.65
 */
test.concurrent(`${chalk.yellowBright("invoice.created consumable: multiple decimal tracks accumulate → advance cycle")}`, async () => {
	const customerId = "inv-created-cons-multi-decimal";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			// Multiple small tracks that accumulate
			s.track({ featureId: TestFeature.Messages, value: 50.3 }),
			s.track({ featureId: TestFeature.Messages, value: 30.7 }),
			s.track({ featureId: TestFeature.Messages, value: 25.5 }),
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	// Total: 50.3 + 30.7 + 25.5 = 106.5, overage = 6.5
	const totalUsage = 50.3 + 30.7 + 25.5; // 106.5
	const expectedOverage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: totalUsage }],
		options: { includeFixed: false, onlyArrear: true },
	});

	// Verify: 6.5 * $0.10 = $0.65
	expect(expectedOverage).toBe(0.7); // rounds to nearest dollar

	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should have 2 invoices: initial ($20) + renewal ($20 + $0.65 = $20.65)
	expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 2,
		latestTotal: 20 + expectedOverage, // $20.65
		latestInvoiceProductId: pro.id,
	});

	// Balance should be reset to 100
	expect(customerAfterAdvance.features[TestFeature.Messages].balance).toBe(100);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Multiple consumable features on same invoice
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro with both consumable messages AND consumable words
 *   - Messages: 100 included, $0.10/unit overage
 *   - Words: 50 included, $0.05/unit overage
 * - Track 200 messages (100 overage) and 150 words (100 overage)
 * - Advance to next billing cycle
 *
 * Expected Result:
 * - Messages overage: 100 * $0.10 = $10
 * - Words overage: 100 * $0.05 = $5
 * - Total second invoice: $20 base + $10 + $5 = $35
 */
test.concurrent(`${chalk.yellowBright("invoice.created consumable: multiple features → different overages → advance cycle")}`, async () => {
	const customerId = "inv-created-cons-multi-feat";

	// Create two consumable items with different pricing
	const consumableMessagesItem = items.consumableMessages({
		includedUsage: 100,
	});
	const consumableWordsItem = items.consumableWords({ includedUsage: 50 });

	const pro = products.pro({
		id: "pro",
		items: [consumableMessagesItem, consumableWordsItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			// Track both features into overage
			s.track({ featureId: TestFeature.Messages, value: 200 }),
			s.track({ featureId: TestFeature.Words, value: 150 }),
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	// Calculate expected overage for messages: (200 - 100) * $0.10 = $10
	const messagesOverage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 200 }],
		options: { includeFixed: false, onlyArrear: true },
	});

	// Calculate expected overage for words: (150 - 50) * $0.05 = $5
	const wordsOverage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Words, value: 150 }],
		options: { includeFixed: false, onlyArrear: true },
	});

	expect(messagesOverage).toBe(10);
	expect(wordsOverage).toBe(5);

	const totalOverage = messagesOverage + wordsOverage; // $15

	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should have 2 invoices: initial ($20) + renewal ($20 + $10 + $5 = $35)
	expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 2,
		latestTotal: 20 + totalOverage, // $35
		latestInvoiceProductId: pro.id,
	});

	// Both balances should be reset
	expect(customerAfterAdvance.features[TestFeature.Messages].balance).toBe(100);
	expect(customerAfterAdvance.features[TestFeature.Words].balance).toBe(50);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Invoice total is correct after invoice.created
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("invoice.created consumable: invoice total is correct (after invoice.created)")}`, async () => {
	const customerId = "inv-created-cons-total-correct";

	const consumableMessagesItem = items.consumableMessages({
		includedUsage: 100,
	});

	const pro = products.pro({
		id: "pro",
		items: [consumableMessagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 200 }),
			s.advanceTestClock({ months: 1 }),
		],
	});

	// Calculate expected overage for messages: (200 - 100) * $0.10 = $10
	const messagesOverage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 200 }],
		options: { includeFixed: false, onlyArrear: true },
	});

	expect(messagesOverage).toBe(10);
	const totalOverage = messagesOverage;

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
		with_autumn_id: true,
	});

	const invoices = await InvoiceService.list({
		db: ctx.db,
		internalCustomerId: customer.autumn_id!,
	});

	expect(invoices.length).toBe(2);
	expect(invoices[1].status).toBe(InvoiceStatus.Draft);
	expect(invoices[1].total).toBe(20 + totalOverage);
});
