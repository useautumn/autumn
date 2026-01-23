/**
 * Cancel Trial Immediately Tests
 *
 * Tests for canceling products with free trials immediately using `cancel: 'immediately'`.
 * Verifies immediate cancellation behavior, invoice handling, and re-attachment flows.
 *
 * Key behaviors:
 * - Product is removed immediately
 * - No refund invoice (trial is free)
 * - Re-attaching after cancel may or may not grant another trial (depends on config)
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, CusProductStatus, ms } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Basic cancel trial immediately
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User attaches proWithTrial (7-day trial)
 * - User cancels immediately
 *
 * Expected Result:
 * - Product is removed immediately
 * - No Stripe subscription (canceled)
 * - No new invoices (trial was free)
 */
test(`${chalk.yellowBright("cancel trial immediately: basic cancel")}`, async () => {
	const customerId = "cancel-trial-imm-basic";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [messagesItem],
		trialDays: 7,
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
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

	// Preview the cancel - should be $0 (no charge for canceling during trial)
	const cancelParams = {
		customer_id: customerId,
		product_id: proTrial.id,
		cancel_action: "cancel_immediately" as const,
	};
	const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);
	expect(preview.total).toBe(0);

	// Execute the cancel
	await autumnV1.subscriptions.update(cancelParams);

	// Verify product is removed
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: proTrial.id,
	});

	// No new invoices (trial was free)
	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 1,
		latestTotal: 0,
	});

	// Verify no Stripe subscription exists (canceled)
	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Cancel trial immediately with free default - free becomes active
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Free default product exists
 * - User attaches proWithTrial (7-day trial)
 * - User cancels immediately
 *
 * Expected Result:
 * - Pro is removed immediately
 * - Free default becomes active immediately
 * - No paid invoices
 */
test(`${chalk.yellowBright("cancel trial immediately: with free default")}`, async () => {
	const customerId = "cancel-trial-imm-default";

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

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, proTrial] }),
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

	// Cancel immediately
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: proTrial.id,
		cancel_action: "cancel_immediately",
	});

	// Verify pro is removed and free is active
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterCancel,
		active: [free.id],
		notPresent: [proTrial.id],
	});

	// No paid invoices
	for (const invoice of customerAfterCancel.invoices ?? []) {
		expect(invoice.total).toBe(0);
	}
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Cancel trial immediately then re-attach (renewal flow)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario (from basic7.test.ts):
 * - User attaches proWithTrial (7-day trial, unique_fingerprint: true)
 * - User cancels immediately
 * - User re-attaches proWithTrial
 *
 * Expected Result:
 * - First attach: trialing, $0 invoice
 * - After cancel: no product
 * - Re-attach: NO duplicate trial, should charge full price immediately
 *
 * Note: This tests the `unique_fingerprint` behavior - customer already used trial
 */
test(`${chalk.yellowBright("cancel trial immediately: re-attach charges full price (no duplicate trial)")}`, async () => {
	const customerId = "cancel-trial-imm-reattach";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [messagesItem],
		trialDays: 7,
	});

	const { autumnV1 } = await initScenario({
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

	// Initial invoice should be $0 (trial)
	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 1,
		latestTotal: 0,
	});

	// Cancel immediately
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: proTrial.id,
		cancel_action: "cancel_immediately",
	});

	// Verify product is removed
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: proTrial.id,
	});

	// Re-attach the product
	await autumnV1.attach({
		customer_id: customerId,
		product_id: proTrial.id,
	});

	// Verify product is now ACTIVE (not trialing) - customer already used trial
	const customerAfterReattach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should NOT be trialing - should be active
	const product = customerAfterReattach.products.find(
		(p) => p.id === proTrial.id,
	);
	expect(product).toBeDefined();
	expect(product?.status).toBe(CusProductStatus.Active);

	// Should have 2 invoices: $0 (trial) + $20 (full price)
	expectCustomerInvoiceCorrect({
		customer: customerAfterReattach,
		count: 2,
		latestTotal: 20, // Pro base price
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Cancel trial immediately with scheduled downgrade - scheduled removed
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User attaches premiumTrial ($50/mo, 7-day trial)
 * - User attaches pro ($20/mo) - scheduled for end of trial (downgrade)
 * - User cancels premium immediately
 *
 * Expected Result:
 * - Premium is removed immediately
 * - Pro scheduled is also removed (no base product anymore)
 * - No products attached (unless free default exists)
 */
test(`${chalk.yellowBright("cancel trial immediately: with scheduled downgrade, both removed")}`, async () => {
	const customerId = "cancel-trial-imm-scheduled";

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

	const { autumnV1, ctx } = await initScenario({
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

	// Attach pro (downgrade - scheduled for trial end)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	// Verify premium is canceling, pro is scheduled
	const customerAfterDowngrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterDowngrade,
		canceling: [premiumTrial.id],
		scheduled: [pro.id],
	});

	// Cancel premium immediately
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: premiumTrial.id,
		cancel_action: "cancel_immediately",
	});

	// Verify both products are removed
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterCancel,
		notPresent: [premiumTrial.id, pro.id],
	});

	expect(customerAfterCancel.products.length).toBe(0);

	// Verify no Stripe subscription exists
	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Cancel trial immediately with consumable messages - no overage
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User attaches proWithTrial with consumable messages
 * - User tracks 500 messages (400 overage)
 * - User cancels immediately
 *
 * Expected Result:
 * - Product is removed immediately
 * - NO overage invoice (usage was free during trial)
 * - Only the initial $0 trial invoice exists
 */
test(`${chalk.yellowBright("cancel trial immediately: with consumable usage, no overage charged")}`, async () => {
	const customerId = "cancel-trial-imm-consumable";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [consumableItem],
		trialDays: 7,
	});

	const { autumnV1 } = await initScenario({
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

	// Cancel immediately
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: proTrial.id,
		cancel_action: "cancel_immediately",
	});

	// Wait for any async processing
	await new Promise((resolve) => setTimeout(resolve, 2000));

	// Verify product is removed
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: proTrial.id,
	});

	// Should only have the initial $0 trial invoice - NO overage invoice
	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 1,
		latestTotal: 0,
	});
});
