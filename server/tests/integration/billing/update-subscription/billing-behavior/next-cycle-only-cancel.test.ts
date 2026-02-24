/**
 * Billing Behavior: next_cycle_only Cancel Tests
 *
 * Tests for canceling subscriptions with billing_behavior: 'next_cycle_only'.
 * When canceling immediately with next_cycle_only, no new invoice should be
 * generated (no proration credits issued).
 *
 * Key behaviors:
 * - Immediate cancel with next_cycle_only creates NO new invoice
 * - Product is removed from customer
 * - Stripe subscription is canceled
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductNotPresent } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// CANCEL WITH next_cycle_only - NO NEW INVOICE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer attaches Pro with prepaid messages (5 units @ $10 = $50)
 * - Immediately cancel with billing_behavior: 'next_cycle_only'
 *
 * Expected Result:
 * - Only 1 invoice exists (initial attach invoice)
 * - NO proration credit invoice is created
 * - Product is removed from customer
 * - Stripe subscription is canceled
 */
test.concurrent(`${chalk.yellowBright("next_cycle_only cancel: immediate cancel creates no new invoice")}`, async () => {
	const billingUnits = 1;
	const pricePerUnit = 10;

	const prepaidItem = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits,
		price: pricePerUnit,
	});
	const pro = products.base({ id: "pro", items: [prepaidItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "bb-cancel-no-invoice",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: "pro",
				options: [{ feature_id: TestFeature.Messages, quantity: 5 }],
			}),
		],
	});

	// Verify initial state: 1 invoice from attach
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features?.[TestFeature.Messages]?.balance).toBe(5);
	expectCustomerInvoiceCorrect({
		customer: customerBefore,
		count: 1,
		latestTotal: 50, // 5 units @ $10
	});

	// Preview the cancel with next_cycle_only - should be $0 (no proration)
	const cancelParams = {
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_immediately" as const,
		billing_behavior: "none" as const,
	};
	const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);
	expect(preview.total).toBe(0);

	// Execute the cancel
	await autumnV1.subscriptions.update(cancelParams);

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Product should be removed
	await expectProductNotPresent({
		customer: customerAfter,
		productId: pro.id,
	});

	// NO new invoice should be created - still just 1 invoice
	expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 1,
		latestTotal: 50, // Same initial invoice
	});

	// Stripe subscription should be canceled
	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMPARISON: Default cancel vs next_cycle_only cancel
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Two customers attach Pro with prepaid messages
 * - One cancels with default behavior (prorate_immediately)
 * - One cancels with next_cycle_only
 *
 * Expected Result:
 * - Default cancel: 2 invoices (attach + proration credit)
 * - next_cycle_only cancel: 1 invoice (only attach)
 */
test.concurrent(`${chalk.yellowBright("next_cycle_only cancel: comparison with default prorate_immediately")}`, async () => {
	const billingUnits = 1;
	const pricePerUnit = 10;

	const prepaidDefault = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits,
		price: pricePerUnit,
	});
	const prepaidDeferred = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits,
		price: pricePerUnit,
	});

	const proDefault = products.base({
		id: "pro-default",
		items: [prepaidDefault],
	});
	const proDeferred = products.base({
		id: "pro-deferred",
		items: [prepaidDeferred],
	});

	// Setup customer with default behavior
	const {
		customerId: customerDefault,
		autumnV1: autumnDefault,
		ctx: ctxDefault,
	} = await initScenario({
		customerId: "bb-cancel-compare-default",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proDefault] }),
		],
		actions: [
			s.attach({
				productId: "pro-default",
				options: [{ feature_id: TestFeature.Messages, quantity: 5 }],
			}),
		],
	});

	// Setup customer with deferred behavior
	const {
		customerId: customerDeferred,
		autumnV1: autumnDeferred,
		ctx: ctxDeferred,
	} = await initScenario({
		customerId: "bb-cancel-compare-deferred",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proDeferred] }),
		],
		actions: [
			s.attach({
				productId: "pro-deferred",
				options: [{ feature_id: TestFeature.Messages, quantity: 5 }],
			}),
		],
	});

	// Preview with default behavior (prorate_immediately) - should have negative total (refund)
	const defaultParams = {
		customer_id: customerDefault,
		product_id: proDefault.id,
		cancel_action: "cancel_immediately" as const,
		// No billing_behavior = defaults to prorate_immediately
	};
	const previewDefault =
		await autumnDefault.subscriptions.previewUpdate(defaultParams);
	expect(previewDefault.total).toBeLessThan(0); // Should be negative (proration credit)

	// Preview with next_cycle_only - should be $0
	const deferredParams = {
		customer_id: customerDeferred,
		product_id: proDeferred.id,
		cancel_action: "cancel_immediately" as const,
		billing_behavior: "none" as const,
	};
	const previewDeferred =
		await autumnDeferred.subscriptions.previewUpdate(deferredParams);
	expect(previewDeferred.total).toBe(0); // No proration with next_cycle_only

	// Cancel with default behavior (prorate_immediately)
	await autumnDefault.subscriptions.update(defaultParams);

	// Cancel with next_cycle_only
	await autumnDeferred.subscriptions.update(deferredParams);

	const customerDefaultAfter =
		await autumnDefault.customers.get<ApiCustomerV3>(customerDefault);
	const customerDeferredAfter =
		await autumnDeferred.customers.get<ApiCustomerV3>(customerDeferred);

	// Both should have product removed
	await expectProductNotPresent({
		customer: customerDefaultAfter,
		productId: proDefault.id,
	});
	await expectProductNotPresent({
		customer: customerDeferredAfter,
		productId: proDeferred.id,
	});

	// Default cancel should have 2 invoices (attach + proration credit)
	expectCustomerInvoiceCorrect({
		customer: customerDefaultAfter,
		count: 2,
	});

	// next_cycle_only cancel should have 1 invoice (only attach)
	expectCustomerInvoiceCorrect({
		customer: customerDeferredAfter,
		count: 1,
	});

	// Both should have no Stripe subscription
	await expectNoStripeSubscription({
		db: ctxDefault.db,
		customerId: customerDefault,
		org: ctxDefault.org,
		env: ctxDefault.env,
	});
	await expectNoStripeSubscription({
		db: ctxDeferred.db,
		customerId: customerDeferred,
		org: ctxDeferred.org,
		env: ctxDeferred.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// CANCEL WITH MONTHLY PRICE (not prepaid)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer attaches Pro with monthly price ($20/month)
 * - Immediately cancel with billing_behavior: 'next_cycle_only'
 *
 * Expected Result:
 * - Only 1 invoice exists (initial attach invoice)
 * - NO proration credit invoice is created
 */
test.concurrent(`${chalk.yellowBright("next_cycle_only cancel: monthly price - no proration credit")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "bb-cancel-monthly-no-credit",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Verify initial state
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: customerBefore,
		count: 1,
		latestTotal: 20,
	});

	// Preview the cancel with next_cycle_only - should be $0 (no proration credit)
	const cancelParams = {
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_immediately" as const,
		billing_behavior: "none" as const,
	};
	const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);
	expect(preview.total).toBe(0);

	// Execute the cancel
	await autumnV1.subscriptions.update(cancelParams);

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Product should be removed
	await expectProductNotPresent({
		customer: customerAfter,
		productId: pro.id,
	});

	// NO new invoice - still just 1 invoice (no proration credit)
	expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 1,
		latestTotal: 20,
	});

	// Stripe subscription should be canceled
	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
