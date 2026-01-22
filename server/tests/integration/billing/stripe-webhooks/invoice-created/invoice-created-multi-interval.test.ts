/**
 * Invoice Created Webhook Tests - Multi-Interval Consumables
 *
 * Tests for handling the `invoice.created` Stripe webhook when products have
 * consumable prices with different billing intervals (e.g., monthly + quarterly).
 *
 * Key behaviors to verify:
 * - Monthly consumables should be billed every month
 * - Quarterly consumables should only be billed every 3 months
 * - Invoice should only include line items for prices whose interval aligns with the invoice
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, ProductItemInterval } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeInvoiceLineItemPeriodCorrect } from "@tests/integration/billing/utils/stripe/expectStripeInvoiceLineItemPeriodCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST: Multi-interval consumables - 3-month cycle
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Product has:
 *   - Consumable messages: 1-month interval, 100 included, $0.10/unit overage
 *   - Consumable words: 3-month interval, 50 included, $0.05/unit overage
 * - Track usage each month and advance through 3 months
 *
 * Expected Result:
 * - Month 1 & 2: Only messages overage billed, words accumulate
 * - Month 3: BOTH messages AND words overage billed, both reset
 */
test(`${chalk.yellowBright("invoice.created multi-interval: monthly + quarterly consumables over 3 months")}`, async () => {
	const customerId = "inv-created-multi-interval";

	const pro = products.pro({
		id: "pro",
		items: [
			items.consumableMessages({ includedUsage: 100 }), // Monthly, $0.10/unit
			items.consumableWords({
				includedUsage: 50,
				interval: ProductItemInterval.Quarter,
			}), // Quarterly, $0.05/unit
		],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Verify pro is active and initial invoice
	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterAttach,
		productId: pro.id,
	});
	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 1,
		latestTotal: 20,
	});

	// ═══════════════════════════════════════════════════════════════════════
	// MONTH 1: Track and advance
	// ═══════════════════════════════════════════════════════════════════════

	// Track 150 messages (50 overage → $5)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 150,
	});

	// Track 70 words (20 overage, but won't be billed yet)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Words,
		value: 70,
	});

	let currentEpochMs = await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const customerMonth1 =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Month 1 invoice: $20 base + $5 messages = $25
	expectCustomerInvoiceCorrect({
		customer: customerMonth1,
		count: 2,
		latestTotal: 25,
	});

	await expectStripeInvoiceLineItemPeriodCorrect({
		customerId,
		productId: pro.id,
		periodStartMs: currentEpochMs,
		periodEndMs: addMonths(currentEpochMs, 1).getTime(),
	});

	// Messages reset, words still accumulating
	expect(customerMonth1.features[TestFeature.Messages].balance).toBe(100);
	expect(customerMonth1.features[TestFeature.Words].balance).toBe(-20); // 50 - 70

	// ═══════════════════════════════════════════════════════════════════════
	// MONTH 2: Track and advance
	// ═══════════════════════════════════════════════════════════════════════

	// Track 200 messages (100 overage → $10)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 200,
	});

	// Track 30 more words (words balance: -20 - 30 = -50 overage total)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Words,
		value: 30,
	});

	currentEpochMs = await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		currentEpochMs,
	});

	const customerMonth2 =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Month 2 invoice: $20 base + $10 messages = $30
	expectCustomerInvoiceCorrect({
		customer: customerMonth2,
		count: 3,
		latestTotal: 30,
	});

	await expectStripeInvoiceLineItemPeriodCorrect({
		customerId,
		productId: pro.id,
		periodStartMs: addMonths(currentEpochMs, 1).getTime(),
		periodEndMs: addMonths(currentEpochMs, 2).getTime(),
	});

	// Messages reset, words still accumulating
	expect(customerMonth2.features[TestFeature.Messages].balance).toBe(100);
	expect(customerMonth2.features[TestFeature.Words].balance).toBe(-50); // -20 - 30

	// ═══════════════════════════════════════════════════════════════════════
	// MONTH 3: Track and advance - QUARTERLY WORDS BILLED!
	// ═══════════════════════════════════════════════════════════════════════

	// Track 180 messages (80 overage → $8)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 180,
	});

	// Track 20 more words (words balance: -50 - 20 = -70 overage total for quarter)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Words,
		value: 20,
	});

	// Verify words overage before Month 3 advance
	const customerBeforeMonth3 =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBeforeMonth3.features[TestFeature.Words].balance).toBe(-70);

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		currentEpochMs,
	});

	const customerMonth3 =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Month 3 invoice: $20 base + $8 messages + $3.50 words (70 * $0.05) = $31.50
	expectCustomerInvoiceCorrect({
		customer: customerMonth3,
		count: 4,
		latestTotal: 20 + 8 + 3.5, // Base + messages + words overage
	});

	// Both should reset now
	expect(customerMonth3.features[TestFeature.Messages].balance).toBe(100);
	expect(customerMonth3.features[TestFeature.Words].balance).toBe(50); // Reset to included

	await expectStripeInvoiceLineItemPeriodCorrect({
		customerId,
		productId: pro.id,
		periodStartMs: currentEpochMs,
		periodEndMs: addMonths(currentEpochMs, 3).getTime(),
	});
});
