import { expect, test } from "bun:test";
import { type ApiCustomerV3, ms } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	expectProductTrialing,
	getTrialEndsAt,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts";

/**
 * Uncancel Combined Tests
 *
 * Tests for uncancel combined with other update operations.
 * Tests: cancel: null + options, cancel: null + items, cancel: null + trialing
 */

// ===============================================================================
// TEST 1: Uncancel + update quantity
// ===============================================================================

/**
 * Scenario:
 * - User is on Pro with some usage tracked
 * - User cancels Pro -> free default is scheduled
 * - User uncancels AND updates quantity in the same request
 *
 * Expected Result:
 * - Pro should be active (not canceling)
 * - Scheduled free product should be deleted
 * - Quantity should be updated
 * - Usage should be preserved
 */
test.concurrent(`${chalk.yellowBright("uncancel + update quantity")}`, async () => {
	const customerId = "uncancel-plus-qty";
	const prepaidItem = items.prepaidMessages({ includedUsage: 0 });
	const freeMessagesItem = items.monthlyMessages({ includedUsage: 10 });

	const pro = products.pro({ items: [prepaidItem] });
	const free = constructProduct({
		id: "free",
		items: [freeMessagesItem],
		type: "free",
		isDefault: true,
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	// Track some usage (the timeout waits after track completes)
	const messagesUsage = 40;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	// Verify usage tracked
	const customerWithUsage =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerWithUsage.features?.[TestFeature.Messages]?.usage).toBe(
		messagesUsage,
	);

	// Cancel pro via subscriptions.update
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel: "end_of_cycle",
	});

	// Verify pro is canceling and free is scheduled
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: pro.id,
	});
	await expectProductScheduled({
		customer: customerAfterCancel,
		productId: free.id,
	});

	// Uncancel AND update quantity in the same request
	const newQuantity = 200;
	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: pro.id,
		cancel: null,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel: null,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});

	// Verify pro is now active (not canceling)
	const customerAfterUncancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterUncancel,
		productId: pro.id,
	});

	// Scheduled free product should be deleted
	await expectProductNotPresent({
		customer: customerAfterUncancel,
		productId: free.id,
	});

	// Balance should be updated (new quantity minus usage)
	expect(customerAfterUncancel.features?.[TestFeature.Messages]?.balance).toBe(
		newQuantity - messagesUsage,
	);

	// Usage should be preserved
	expect(customerAfterUncancel.features?.[TestFeature.Messages]?.usage).toBe(
		messagesUsage,
	);

	// Verify Stripe subscription is correct
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});

	// Verify invoices
	expectCustomerInvoiceCorrect({
		customer: customerAfterUncancel,
		count: 2, // Initial attach + update
		latestTotal: preview.total,
	});
});

// ===============================================================================
// TEST 2: Uncancel + custom plan (items)
// ===============================================================================

/**
 * Scenario:
 * - User is on Pro
 * - User cancels Pro -> free default is scheduled
 * - User uncancels AND provides custom items in the same request
 *
 * Expected Result:
 * - Pro should be active with custom items
 * - Scheduled free product should be deleted
 */
test.concurrent(`${chalk.yellowBright("uncancel + custom plan (items)")}`, async () => {
	const customerId = "uncancel-plus-items";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeMessagesItem = items.monthlyMessages({ includedUsage: 10 });

	const pro = products.pro({ items: [messagesItem] });
	const free = constructProduct({
		id: "free",
		items: [freeMessagesItem],
		type: "free",
		isDefault: true,
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Cancel pro via subscriptions.update
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel: "end_of_cycle",
	});

	// Verify pro is canceling and free is scheduled
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: pro.id,
	});
	await expectProductScheduled({
		customer: customerAfterCancel,
		productId: free.id,
	});

	// Uncancel AND provide custom items in the same request
	const updatedMessagesItem = items.monthlyMessages({ includedUsage: 200 });
	const newPriceItem = items.monthlyPrice({ price: 30 });

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: pro.id,
		cancel: null,
		items: [updatedMessagesItem, newPriceItem],
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel: null,
		items: [updatedMessagesItem, newPriceItem],
	});

	// Verify pro is now active (not canceling)
	const customerAfterUncancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterUncancel,
		productId: pro.id,
	});

	// Scheduled free product should be deleted
	await expectProductNotPresent({
		customer: customerAfterUncancel,
		productId: free.id,
	});

	// Balance should reflect the custom plan (200 messages)
	expect(customerAfterUncancel.features?.[TestFeature.Messages]?.balance).toBe(
		200,
	);

	// Verify Stripe subscription is correct
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});

	// Verify invoices
	expectCustomerInvoiceCorrect({
		customer: customerAfterUncancel,
		count: 2, // Initial attach + update
		latestTotal: preview.total,
	});
});

// ===============================================================================
// TEST 3: Uncancel trialing product
// ===============================================================================

/**
 * Scenario:
 * - User is on Pro with trial (14 days)
 * - User cancels Pro while trialing -> product becomes trialing + canceling
 * - User uncancels
 *
 * Expected Result:
 * - Pro should be trialing (still in trial period)
 * - Trial end time should be unchanged
 * - Product should no longer be canceling
 */
test.concurrent(`${chalk.yellowBright("uncancel trialing product")}`, async () => {
	const customerId = "uncancel-trialing";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		items: [messagesItem],
		id: "pro-trial",
		trialDays: 14,
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
	});

	// Verify initially trialing
	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerAfterAttach,
		productId: proTrial.id,
	});

	// Get the trial end time before cancel
	const trialEndsAtBefore = await getTrialEndsAt({
		customer: customerAfterAttach,
		productId: proTrial.id,
	});
	expect(trialEndsAtBefore).toBeDefined();

	// Cancel the trialing product via subscriptions.update
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: proTrial.id,
		cancel: "end_of_cycle",
	});

	// Verify product is canceling (canceled flag set, but still trialing)
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: proTrial.id,
	});

	// Uncancel
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: proTrial.id,
		cancel: null,
	});

	// Verify product is still trialing and no longer canceling
	const customerAfterUncancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should be trialing (active with trial status)
	await expectProductTrialing({
		customer: customerAfterUncancel,
		productId: proTrial.id,
	});

	// Get the trial end time after uncancel
	const trialEndsAtAfter = await getTrialEndsAt({
		customer: customerAfterUncancel,
		productId: proTrial.id,
	});

	// Trial end time should be unchanged (within tolerance)
	expect(trialEndsAtAfter).toBeDefined();
	expect(
		Math.abs(trialEndsAtAfter! - trialEndsAtBefore!) < ms.minutes(10),
	).toBe(true);

	// Balance should be unchanged
	expect(customerAfterUncancel.features?.[TestFeature.Messages]?.balance).toBe(
		100,
	);

	// Verify Stripe subscription is correct (not set to cancel)
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});
});
