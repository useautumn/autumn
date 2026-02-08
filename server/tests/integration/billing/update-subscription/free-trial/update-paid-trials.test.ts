import { expect, test } from "bun:test";
import { type ApiCustomerV3, FreeTrialDuration, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { calculateProratedRefund } from "@tests/integration/billing/utils/stripeSubscriptionUtils";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/**
 * Paid-to-Paid with Trial Tests
 *
 * Tests for scenarios involving paid products with trials - removing, updating, and preserving trials.
 * Uses `status === "trialing"` and `current_period_end` to verify trial state.
 */

// 1. Remove trial while running (free_trial: null)
test.concurrent(`${chalk.yellowBright("p2p-trial: remove trial while running")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		items: [messagesItem],
		id: "pro-trial",
		trialDays: 14,
	});

	const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
		customerId: "p2p-remove-trial-active",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [
			s.attach({ productId: proTrial.id }),
			s.advanceTestClock({ days: 7 }),
		],
	});

	// Remove the trial by passing free_trial: null
	const updateParams = {
		customer_id: customerId,
		product_id: proTrial.id,
		free_trial: null,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should charge full price since trial is being removed
	expect(preview.total).toEqual(20);

	// When trial is removed, next_cycle should start in ~1 month (regular billing)
	expectPreviewNextCycleCorrect({
		preview,
		expectDefined: false,
	});

	await autumnV1.subscriptions.update(updateParams, { timeout: 5000 });

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Product should no longer be trialing (use advancedTo for test clock time)
	await expectProductNotTrialing({
		customer,
		productId: proTrial.id,
		nowMs: advancedTo,
	});

	// Should now be active (not trialing)
	await expectProductActive({
		customer,
		productId: proTrial.id,
	});

	// Invoice should have been created with full price
	expectCustomerInvoiceCorrect({
		customer,
		count: 2, // Initial $0 trial invoice + $20 charge
		latestTotal: 20,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: {
			checkNotTrialing: true,
		},
	});
});

// 2. Remove trial after ended (should be no-op)
test.concurrent(`${chalk.yellowBright("p2p-trial: remove trial after ended (no-op)")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		items: [messagesItem],
		id: "pro-trial",
		trialDays: 7,
	});

	const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
		customerId: "p2p-remove-trial-ended",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [
			s.attach({ productId: proTrial.id }),
			s.advanceTestClock({ days: 14 }), // Advance to trial end
		],
	});

	// After advancing, product should no longer be trialing
	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotTrialing({
		customer: customerAfterAdvance,
		productId: proTrial.id,
		nowMs: advancedTo,
	});

	// Now try to remove trial (should be no-op since trial already ended)
	const updateParams = {
		customer_id: customerId,
		product_id: proTrial.id,
		free_trial: null,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// No change expected
	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Still not trialing
	await expectProductNotTrialing({
		customer,
		productId: proTrial.id,
		nowMs: advancedTo,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: {
			checkNotTrialing: true,
		},
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2, // Initial $0 trial invoice + $20 charge for trial ending
	});
});

// 3. Trial carries over (free_trial: undefined)
test.concurrent(`${chalk.yellowBright("p2p-trial: trial carries over when undefined")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		items: [messagesItem],
		id: "pro-trial",
		trialDays: 14,
	});

	const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
		customerId: "p2p-trial-carryover",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [
			s.attach({ productId: proTrial.id }),
			s.advanceTestClock({ days: 7 }),
		],
	});

	// Verify initially trialing
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerBefore,
		productId: proTrial.id,
	});
	const initialTrialEnd = customerBefore.products?.find(
		(p) => p.id === proTrial.id,
	)?.current_period_end;

	// Update WITHOUT specifying free_trial (undefined) - should preserve trial
	const updatedMessagesItem = items.monthlyMessages({ includedUsage: 200 });

	const updateParams = {
		customer_id: customerId,
		product_id: proTrial.id,
		items: [updatedMessagesItem, items.monthlyPrice()],
		// free_trial is NOT specified (undefined)
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should be 0 during trial
	expect(preview.total).toEqual(0);

	// next_cycle should align with existing trial (~7 days remaining from 14-day trial after 7 days advanced)
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(7),
		total: items.monthlyPrice().price!,
	});

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Trial should be preserved
	await expectProductTrialing({
		customer,
		productId: proTrial.id,
	});

	// Verify trial end is the same
	const newTrialEnd = customer.products?.find(
		(p) => p.id === proTrial.id,
	)?.current_period_end;
	expect(Math.abs(newTrialEnd! - initialTrialEnd!)).toBeLessThan(60000);

	// Feature updated
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: updatedMessagesItem.included_usage,
		balance: updatedMessagesItem.included_usage,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 4. Replace trial mid-trial with new free_trial
test.concurrent(`${chalk.yellowBright("p2p-trial: replace trial with new trial")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		items: [messagesItem],
		id: "pro-trial",
		trialDays: 7,
	});

	const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
		customerId: "p2p-replace-trial",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [
			s.attach({ productId: proTrial.id }),
			s.advanceTestClock({ days: 3 }), // Advance 3 days into 7-day trial
		],
	});

	// Verify still trialing (4 days remaining from advancedTo)
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerBefore,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(4), // 7 - 3 = 4 days remaining
	});

	// Replace with a new 30-day trial
	const updateParams = {
		customer_id: customerId,
		product_id: proTrial.id,
		// items: [messagesItem, items.monthlyPrice()],
		free_trial: {
			length: 30,
			duration: FreeTrialDuration.Day,
			card_required: true,
			unique_fingerprint: false,
		},
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should be 0 during trial
	expect(preview.total).toEqual(0);

	// next_cycle should show new 30-day trial end
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(30),
		total: items.monthlyPrice().price!,
	});

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should now have a 30-day trial
	await expectProductTrialing({
		customer,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(30),
		toleranceMs: ms.hours(3),
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 5. Paid product (no trial) → Paid product with trial, items undefined
test.concurrent(`${chalk.yellowBright("p2p-trial: paid no trial -> paid with trial")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice();

	const pro = products.base({
		items: [messagesItem, priceItem],
		id: "pro-no-trial",
	});

	const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
		customerId: "p2p-no-trial-to-trial",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Track some usage before update
	const messagesUsage = 35;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	// Verify initially NOT trialing
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotTrialing({
		customer: customerBefore,
		productId: pro.id,
	});

	// Add trial without passing items (items undefined)
	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		// items is NOT specified (undefined)
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
			card_required: true,
			unique_fingerprint: false,
		},
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should be refunded for unused time (-$20)
	expect(preview.total).toEqual(-20);

	// next_cycle should show when trial ends
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(14),
		total: priceItem.price!,
	});

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Product should now be trialing
	await expectProductTrialing({
		customer,
		productId: pro.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// Feature should still have correct values with usage preserved
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage - messagesUsage,
		usage: messagesUsage,
		resetsAt: advancedTo + ms.days(14),
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 6. New trial after old expired
test.concurrent(`${chalk.yellowBright("p2p-trial: new trial after old expired")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice();
	const trialDays = 7;

	const proTrial = products.proWithTrial({
		items: [messagesItem],
		id: "pro-trial",
		trialDays,
	});

	const daysAdvanced = 12;

	const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
		customerId: "p2p-new-trial-after-expired",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [
			s.attach({ productId: proTrial.id }),
			s.advanceTestClock({ days: daysAdvanced }), // Advance past 7-day trial
		],
	});

	// Track some usage before update
	const messagesUsage = 45;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 4000 },
	);

	// Verify no longer trialing (trial has ended)
	await expectProductNotTrialing({
		customerId,
		productId: proTrial.id,
		nowMs: advancedTo,
	});

	// Add a new 14-day trial
	const newTrialDays = 14;
	const updateParams = {
		customer_id: customerId,
		product_id: proTrial.id,
		free_trial: {
			length: newTrialDays,
			duration: FreeTrialDuration.Day,
			card_required: true,
			unique_fingerprint: false,
		},
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Calculate prorated refund using Stripe subscription's billing period
	const proratedRefund = await calculateProratedRefund({
		customerId,
		nowMs: advancedTo,
		amount: priceItem.price!,
	});

	expect(preview.total).toEqual(proratedRefund);

	// next_cycle should show new 14-day trial end
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(newTrialDays),
		total: priceItem.price!,
	});

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should now be trialing again with 14-day trial
	await expectProductTrialing({
		customer,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(newTrialDays),
	});

	// Usage should be preserved, reset should follow new trial end
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage - messagesUsage,
		usage: messagesUsage,
		resetsAt: advancedTo + ms.days(newTrialDays),
	});

	// Invoice count: 1 ($0 trial) + 1 ($20 trial end) + 1 (refund ~-$18) = 3
	expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		latestTotal: proratedRefund,
		latestInvoiceProductId: proTrial.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAID-TO-FREE WITH TRIAL
// ═══════════════════════════════════════════════════════════════════════════════

// 7. Paid (no trial) -> Free with trial
test.concurrent(`${chalk.yellowBright("p2f-trial: paid no trial -> free with trial")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice();

	const pro = products.base({
		items: [messagesItem, priceItem],
		id: "pro-no-trial",
	});

	const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
		customerId: "p2f-no-trial-to-trial",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Verify initially NOT trialing
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotTrialing({
		customer: customerBefore,
		productId: pro.id,
	});

	// Update to free (remove price) but add trial
	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem], // No price item = free
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
			card_required: false,
			unique_fingerprint: false,
		},
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should be refunded for the removed price (-$20)
	expect(preview.total).toEqual(-20);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Product should now be trialing
	await expectProductTrialing({
		customer,
		productId: pro.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// Usage should be preserved, reset should follow new trial end
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
		resetsAt: advancedTo + ms.days(14),
	});
});

// 8. Paid with trial (mid-cycle after trial ended) -> Free (no trial)
test.concurrent(`${chalk.yellowBright("p2f-trial: paid with trial -> free no trial")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		items: [messagesItem],
		id: "pro-trial",
		trialDays: 7,
	});

	const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
		customerId: "p2f-trial-to-no-trial",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [
			s.attach({ productId: proTrial.id }),
			s.advanceTestClock({ days: 10 }), // Advance past 7-day trial to mid-cycle
		],
	});

	// Track some usage before update
	const messagesUsage = 30;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	// Verify no longer trialing (trial has ended, now paying)
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotTrialing({
		customer: customerBefore,
		productId: proTrial.id,
		nowMs: advancedTo,
	});

	// Update to free (remove price), no trial specified
	const updateParams = {
		customer_id: customerId,
		product_id: proTrial.id,
		items: [messagesItem], // No price item = free
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should credit for the removed price
	expect(preview.total).toBeLessThanOrEqual(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Product should NOT be trialing
	await expectProductNotTrialing({
		customer,
		productId: proTrial.id,
		nowMs: advancedTo,
	});

	// Usage should be preserved, reset should be from advancedTo + 1 month
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage - messagesUsage,
		usage: messagesUsage,
		// resetsAt: advancedTo + ms.days(30),
	});
});
