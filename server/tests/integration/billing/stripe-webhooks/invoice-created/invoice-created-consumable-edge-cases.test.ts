/**
 * Invoice Created Webhook Tests - Consumable Edge Cases
 *
 * Tests for edge case scenarios involving consumable (usage-in-arrear) prices
 * during downgrades, multiple subscriptions, and complex billing scenarios.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { calculateExpectedInvoiceAmount } from "@tests/integration/billing/utils/calculateExpectedInvoiceAmount";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Downgrade with consumable - overage billed to correct product
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Premium ($50/mo) and Pro ($20/mo) both have consumable messages (100 included, $0.10/unit)
 * - Customer starts on Premium
 * - Track 200 messages (100 overage)
 * - Downgrade to Pro (schedules Pro, Premium becomes canceling)
 * - Advance to next billing cycle
 *
 * Expected Result:
 * - Initial invoice: $50 (premium base price)
 * - After cycle: Pro base ($20) + Premium overage (100 * $0.10 = $10) = $30
 * - Customer should be on Pro after cycle
 * - Balance should be reset to 100 (Pro's included usage)
 */
test.concurrent(`${chalk.yellowBright("invoice.created consumable edge: downgrade with overage billed to previous product")}`, async () => {
	const customerId = "inv-created-cons-downgrade";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });

	// Premium product ($50/mo) with consumable
	const premium = constructProduct({
		id: "premium",
		items: [consumableItem],
		type: "premium",
		isDefault: false,
	});

	// Pro product ($20/mo) with consumable - same group as premium (default)
	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			// 1. Start on Premium
			s.attach({ productId: premium.id }),
			// 2. Track into overage while on Premium
			s.track({ featureId: TestFeature.Messages, value: 200 }),
			// 3. Downgrade to Pro (schedules Pro, Premium becomes canceling)
			s.attach({ productId: pro.id }),
			// 4. Advance to next billing cycle
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	// Calculate expected overage from Premium: (200 - 100) * $0.10 = $10
	const expectedOverage = calculateExpectedInvoiceAmount({
		items: premium.items,
		usage: [{ featureId: TestFeature.Messages, value: 200 }],
		options: { includeFixed: false, onlyArrear: true },
	});

	expect(expectedOverage).toBe(10);

	// Verify final state
	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Customer should now be on Pro (downgrade completed)
	await expectCustomerProducts({
		customer: customerAfterAdvance,
		active: [pro.id],
		notPresent: [premium.id],
	});

	// Should have 2 invoices:
	// 1. Initial ($50 premium)
	// 2. Renewal: Pro base ($20) + Premium overage ($10) = $30
	expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 2,
		latestTotal: 20 + expectedOverage, // $20 Pro base + $10 Premium overage
		latestInvoiceProductIds: [pro.id, premium.id], // Pro (new base) + Premium (overage)
	});

	// Balance should be reset to Pro's included usage (100)
	expect(customerAfterAdvance.features[TestFeature.Messages].balance).toBe(100);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Addon with separate subscription + consumable
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro ($20/mo) with consumable messages (100 included, $0.10/unit)
 * - Recurring Addon ($20/mo) with consumable words (50 included, $0.05/unit)
 *   - Addon attached with new_billing_subscription: true (separate Stripe subscription)
 * - Track 200 messages (100 overage) and 150 words (100 overage)
 * - Advance to next billing cycle
 *
 * Expected Result:
 * - Pro invoice: $20 base + $10 message overage = $30
 * - Addon invoice: $20 base + $5 word overage = $25
 * - Each subscription's invoice has its own product's overage
 */
test.concurrent(`${chalk.yellowBright("invoice.created consumable edge: addon separate subscription with consumable")}`, async () => {
	const customerId = "inv-created-cons-addon-sep-sub";

	const consumableMessagesItem = items.consumableMessages({
		includedUsage: 100,
	});
	const consumableWordsItem = items.consumableWords({ includedUsage: 50 });

	const pro = products.pro({
		id: "pro",
		items: [consumableMessagesItem],
	});

	const addon = products.recurringAddOn({
		id: "addon",
		items: [consumableWordsItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [
			// 1. Attach Pro
			s.attach({ productId: pro.id }),
			// 2. Attach Addon on separate subscription
			s.attach({ productId: addon.id, newBillingSubscription: true }),
			// 3. Track usage on both features
			s.track({ featureId: TestFeature.Messages, value: 200 }),
			s.track({ featureId: TestFeature.Words, value: 150 }),
			// 4. Advance to next billing cycle (both subscriptions)
			s.advanceToNextInvoice(),
		],
	});

	// Calculate expected overages
	const expectedMessagesOverage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 200 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(expectedMessagesOverage).toBe(10); // (200 - 100) * $0.10

	const expectedWordsOverage = calculateExpectedInvoiceAmount({
		items: addon.items,
		usage: [{ featureId: TestFeature.Words, value: 150 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(expectedWordsOverage).toBe(5); // (150 - 50) * $0.05

	// Verify final state
	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Both products should be active
	await expectProductActive({
		customer: customerAfterAdvance,
		productId: pro.id,
	});
	await expectProductActive({
		customer: customerAfterAdvance,
		productId: addon.id,
	});

	// Should have 4 invoices:
	// 1. Initial Pro ($20)
	// 2. Initial Addon ($20)
	// 3. Pro renewal: $20 base + $10 overage = $30
	// 4. Addon renewal: $20 base + $5 overage = $25
	expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 4,
	});

	// Verify both balances are reset correctly
	expect(customerAfterAdvance.features[TestFeature.Messages].balance).toBe(100);
	expect(customerAfterAdvance.features[TestFeature.Words].balance).toBe(50);

	// Verify each renewal invoice has correct amounts
	const invoices = customerAfterAdvance.invoices ?? [];

	// Get the two most recent invoices (renewals)
	const sortedInvoices = [...invoices].sort(
		(a, b) => (b.created_at ?? 0) - (a.created_at ?? 0),
	);
	const [latestInvoice, secondLatestInvoice] = sortedInvoices;

	// Find Pro and Addon renewal invoices by plan_ids
	const proRenewalInvoice = [latestInvoice, secondLatestInvoice].find((inv) =>
		inv.product_ids?.includes(pro.id),
	);
	const addonRenewalInvoice = [latestInvoice, secondLatestInvoice].find((inv) =>
		inv.product_ids?.includes(addon.id),
	);

	// Pro renewal: $20 base + $10 overage = $30
	expect(proRenewalInvoice).toBeDefined();
	expect(proRenewalInvoice?.total).toBe(20 + expectedMessagesOverage);

	// Addon renewal: $20 base + $5 overage = $25
	expect(addonRenewalInvoice).toBeDefined();
	expect(addonRenewalInvoice?.total).toBe(20 + expectedWordsOverage);
});
