/**
 * Cancel End-of-Cycle Trial Tests
 *
 * Tests for canceling products with free trials at end of billing cycle.
 * Verifies trial cancellation behavior, preview responses, and invoice handling.
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, ms } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductCanceling,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Basic cancel trial EOC - preview.next_cycle null, no invoice after advance
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User attaches proWithTrial (7-day trial)
 * - User cancels at end of cycle
 *
 * Expected Result:
 * - Preview should have next_cycle as null/undefined (canceling, no next cycle)
 * - Product should be canceling but still trialing
 * - After advancing past trial end:
 *   - Product is not present
 *   - No invoice created (was free during trial)
 */
test(`${chalk.yellowBright("cancel trial EOC: basic cancel, preview.next_cycle null, no invoice after advance")}`, async () => {
	const customerId = "cancel-trial-eoc-basic";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [messagesItem],
		trialDays: 7,
	});

	const { autumnV1, ctx, testClockId, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
	});

	// Verify product is trialing
	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer: customerAfterAttach,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	// Initial invoice should be $0 (trial)
	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 1,
		latestTotal: 0,
	});

	// Preview the cancel
	const cancelParams = {
		customer_id: customerId,
		product_id: proTrial.id,
		cancel_action: "cancel_end_of_cycle" as const,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);

	// Preview total should be $0 (no charge for canceling during trial)
	expect(preview.total).toBe(0);

	// next_cycle should be null/undefined since we're canceling
	expectPreviewNextCycleCorrect({
		preview,
		expectDefined: false,
	});

	// Execute the cancel
	await autumnV1.subscriptions.update(cancelParams);

	// Verify product is canceling but still trialing
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: proTrial.id,
	});

	// Should still be trialing (status can be both canceling and trialing)
	await expectProductTrialing({
		customer: customerAfterCancel,
		productId: proTrial.id,
	});

	// Advance past trial end
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: advancedTo + ms.days(10),
	});

	// Verify product is removed
	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductNotPresent({
		customer: customerAfterAdvance,
		productId: proTrial.id,
	});

	// Should still only have 1 invoice (the initial $0 trial invoice)
	// No new invoice created because product was canceled during trial
	expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 1,
		latestTotal: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Cancel trial EOC with consumable messages - no overage invoice
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User attaches proWithTrial with consumable messages (100 included)
 * - User tracks 500 messages (400 overage)
 * - User cancels at end of cycle
 *
 * Expected Result:
 * - After advancing past trial end:
 *   - Product is removed
 *   - No overage invoice (usage was free during trial)
 *   - Stripe doesn't create an extra invoice when trial ends
 */

test(`${chalk.yellowBright("cancel trial EOC: with consumable messages, no overage invoice")}`, async () => {
	const customerId = "cancel-trial-eoc-consumable";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [consumableItem],
		trialDays: 7,
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
	});

	// Verify product is trialing
	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer: customerAfterAttach,
		productId: proTrial.id,
	});

	// Track 500 messages (100 included, 400 overage = $40 if billed)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 500,
	});

	// Verify usage was tracked
	const customerAfterTrack =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfterTrack.features[TestFeature.Messages].balance).toBe(-400);

	// Cancel at end of cycle
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: proTrial.id,
		cancel_action: "cancel_end_of_cycle",
	});

	// Verify product is canceling
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: proTrial.id,
	});

	// Initial invoice count
	const initialInvoiceCount = customerAfterCancel.invoices?.length ?? 0;

	// Advance past trial end
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Verify product is removed
	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductNotPresent({
		customer: customerAfterAdvance,
		productId: proTrial.id,
	});

	// No new invoice should be created - usage was free during trial
	// Invoice count should be same or only have $0 invoices
	const finalInvoiceCount = customerAfterAdvance.invoices?.length ?? 0;
	const latestInvoice = customerAfterAdvance.invoices?.[0];

	// Either no new invoice, or if there is one, it should be $0
	if (finalInvoiceCount > initialInvoiceCount) {
		expect(latestInvoice?.total).toBe(0);
	}
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Cancel premium trial with pro scheduled - scheduled is removed
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User attaches premiumTrial ($50/mo, 7-day trial)
 * - User attaches pro ($20/mo) - scheduled to start at trial end (downgrade)
 * - User cancels premium at end of cycle
 *
 * Expected Result:
 * - Pro scheduled should be automatically removed
 * - After advancing past trial end:
 *   - Neither premium nor pro is present
 *   - No invoice created
 */
test(`${chalk.yellowBright("cancel trial EOC: premium trial with pro scheduled, cancel removes scheduled")}`, async () => {
	const customerId = "cancel-trial-eoc-scheduled";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const premiumTrial = products.premiumWithTrial({
		id: "premium-trial",
		items: [messagesItem],
		trialDays: 7,
	});

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premiumTrial, pro] }),
		],
		actions: [s.attach({ productId: premiumTrial.id })],
	});

	// Verify premium is trialing
	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer: customerAfterAttach,
		productId: premiumTrial.id,
	});

	// Attach pro (downgrade - should be scheduled at trial end)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	// Verify premium is canceling and pro is scheduled
	const customerAfterDowngrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductCanceling({
		customer: customerAfterDowngrade,
		productId: premiumTrial.id,
	});

	await expectProductScheduled({
		customer: customerAfterDowngrade,
		productId: pro.id,
	});

	// Cancel premium at end of cycle
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: premiumTrial.id,
		cancel_action: "cancel_end_of_cycle",
	});

	// Verify pro scheduled is removed
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Premium should still be canceling
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: premiumTrial.id,
	});

	// Pro should no longer be scheduled (removed)
	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: pro.id,
	});

	// Advance past trial end
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Verify both products are removed
	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductNotPresent({
		customer: customerAfterAdvance,
		productId: premiumTrial.id,
	});

	await expectProductNotPresent({
		customer: customerAfterAdvance,
		productId: pro.id,
	});

	// No paid invoice should be created (only $0 trial invoices)
	const invoices = customerAfterAdvance.invoices ?? [];
	for (const invoice of invoices) {
		expect(invoice.total).toBe(0);
	}
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Cancel trial EOC with free default - free scheduled
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Free default product exists
 * - User attaches proWithTrial (7-day trial)
 * - User cancels at end of cycle
 *
 * Expected Result:
 * - Pro should be canceling
 * - Free default should be scheduled
 * - After advancing past trial end:
 *   - Free is active
 *   - Pro is not present
 *   - No paid invoice created
 */
test(`${chalk.yellowBright("cancel trial EOC: with free default, free scheduled")}`, async () => {
	const customerId = "cancel-trial-eoc-free-default";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [messagesItem],
		trialDays: 7,
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, proTrial] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
	});

	// Verify pro is trialing
	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer: customerAfterAttach,
		productId: proTrial.id,
	});

	// Cancel at end of cycle
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: proTrial.id,
		cancel_action: "cancel_end_of_cycle",
	});

	// Verify pro is canceling and free is scheduled
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterCancel,
		canceling: [proTrial.id],
		scheduled: [free.id],
	});

	// Verify free is scheduled to start when trial ends (7 days), not a month from now
	await expectProductScheduled({
		customer: customerAfterCancel,
		productId: free.id,
		startsAt: Date.now() + ms.days(7),
	});

	// Advance past trial end
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Verify free is active and pro is removed
	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterAdvance,
		active: [free.id],
		notPresent: [proTrial.id],
	});

	// No paid invoice should be created
	for (const inv of customerAfterAdvance.invoices ?? [])
		expect(inv.total).toBe(0);
});
