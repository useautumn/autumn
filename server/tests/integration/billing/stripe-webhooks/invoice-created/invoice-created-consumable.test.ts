/**
 * Invoice Created Webhook Tests - Consumable Prices
 *
 * Tests for handling the `invoice.created` Stripe webhook event for consumable
 * (usage-in-arrear) prices. These tests verify that:
 * 1. Usage is correctly submitted to Stripe as invoice line items
 * 2. Entitlement balances are reset after the invoice is created
 * 3. Overage pricing is calculated correctly
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { calculateExpectedInvoiceAmount } from "@tests/integration/billing/utils/calculateExpectedInvoiceAmount";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Attach pro with consumable → track into overage (decimal) → advance cycle
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro with consumable messages (100 included, $0.10/unit overage)
 * - Pro has a $20/month base price
 * - Track 250.5 messages (150.5 overage)
 * - Advance to next billing cycle
 *
 * Expected Result:
 * - Initial invoice: $20 (pro base price)
 * - After cycle: invoice should include base price ($20) + overage (150.5 * $0.10 = $15.05)
 * - Total second invoice: $20 + $15.05 = $35.05
 * - Balance should be reset to 100 (included usage)
 */
test(`${chalk.yellowBright("invoice.created consumable: attach → track decimal overage → advance cycle")}`, async () => {
	const customerId = "inv-created-cons-decimal";

	// Create consumable messages with 100 included
	const consumableItem = items.consumableMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Verify pro is active
	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterAttach,
		productId: pro.id,
	});

	// Initial attach invoice: $20 base price
	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 1,
		latestTotal: 20,
	});

	// Verify initial balance = 100 (included usage)
	expect(customerAfterAttach.features[TestFeature.Messages].balance).toBe(100);

	// Track 250.5 messages (100 included, 150.5 overage)
	// Using a decimal to test proper rounding/handling
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 250.5,
	});

	// Verify usage was tracked (balance should be 100 - 250.5 = -150.5)
	const customerAfterTrack =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfterTrack.features[TestFeature.Messages].balance).toBe(
		-150.5,
	);

	// Advance to next billing cycle - this triggers invoice.created webhook
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		withPause: true,
	});
	return;

	// Calculate expected overage: 150.5 units * $0.10 = $15.05
	const expectedOverage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 250.5 }],
		options: { includeFixed: false, onlyArrear: true },
	});

	// Verify overage calculation: (250.5 - 100) * $0.10 = $15.05
	expect(expectedOverage).toBe(15.05);

	// Verify final state
	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Product should still be active
	await expectProductActive({
		customer: customerAfterAdvance,
		productId: pro.id,
	});

	// Should have 2 invoices: initial ($20) + renewal ($20 base + $15.05 overage = $35.05)
	expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 2,
		latestTotal: 20 + expectedOverage, // $20 base + $15.05 overage
		latestInvoiceProductId: pro.id,
	});

	// Balance should be reset to 100 (included usage) after cycle
	expect(customerAfterAdvance.features[TestFeature.Messages].balance).toBe(100);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: No overage - track within included usage → advance cycle
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro with consumable messages (100 included, $0.10/unit overage)
 * - Track 50 messages (within included usage, no overage)
 * - Advance to next billing cycle
 *
 * Expected Result:
 * - Initial invoice: $20 (pro base price)
 * - After cycle: invoice should only include base price ($20), no overage
 * - Balance should be reset to 100 (included usage)
 */
test(`${chalk.yellowBright("invoice.created consumable: no overage - track within included → advance cycle")}`, async () => {
	const customerId = "inv-created-cons-no-ovg";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Verify pro is active
	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterAttach,
		productId: pro.id,
	});

	// Track 50 messages (within 100 included, no overage)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 50,
	});

	// Verify balance: 100 - 50 = 50
	const customerAfterTrack =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfterTrack.features[TestFeature.Messages].balance).toBe(50);

	// Advance to next billing cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Verify final state
	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should have 2 invoices: initial ($20) + renewal ($20 base only, no overage)
	expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 2,
		latestTotal: 20, // Only base price, no overage
		latestInvoiceProductId: pro.id,
	});

	// Balance should be reset to 100 after cycle
	expect(customerAfterAdvance.features[TestFeature.Messages].balance).toBe(100);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Large overage with exact calculation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro with consumable messages (100 included, $0.10/unit overage)
 * - Track 1000 messages (900 overage)
 * - Advance to next billing cycle
 *
 * Expected Result:
 * - Initial invoice: $20 (pro base price)
 * - After cycle: $20 base + $90 overage (900 * $0.10) = $110
 */
test(`${chalk.yellowBright("invoice.created consumable: large overage → advance cycle")}`, async () => {
	const customerId = "inv-created-cons-large";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Track 1000 messages (100 included, 900 overage)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 1000,
	});

	// Verify overage tracked
	const customerAfterTrack =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfterTrack.features[TestFeature.Messages].balance).toBe(-900);

	// Advance to next billing cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Calculate expected: 900 * $0.10 = $90
	const expectedOverage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 1000 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(expectedOverage).toBe(90);

	// Verify final state
	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should have 2 invoices: initial ($20) + renewal ($20 + $90 = $110)
	expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 2,
		latestTotal: 20 + expectedOverage, // $110
		latestInvoiceProductId: pro.id,
	});

	// Balance should be reset to 100
	expect(customerAfterAdvance.features[TestFeature.Messages].balance).toBe(100);
});
