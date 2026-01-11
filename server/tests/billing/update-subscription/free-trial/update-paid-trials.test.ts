import { expect, test } from "bun:test";
import { type ApiCustomerV3, FreeTrialDuration, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/billing/utils/expectCustomerProductCorrect";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/billing/utils/expectCustomerProductTrialing";
import { expectPreviewNextCycleCorrect } from "@tests/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
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

	const { customerId, autumnV1, ctx, testClockId } = await initScenario({
		customerId: "p2p-remove-trial-active",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
	});

	// Verify initially trialing
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerBefore,
		productId: proTrial.id,
	});

	// Advance to mid-trial (7 days into 14-day trial)
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 7,
	});

	// Remove the trial by passing free_trial: null
	const updateParams = {
		customer_id: customerId,
		product_id: proTrial.id,
		items: [messagesItem, items.monthlyPrice()],
		free_trial: null,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should charge full price since trial is being removed
	expect(preview.total).toEqual(20);

	// When trial is removed, next_cycle should start in ~1 month (regular billing)
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: ms.days(30),
		total: items.monthlyPrice().price!,
	});

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Product should no longer be trialing
	await expectProductNotTrialing({
		customer,
		productId: proTrial.id,
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

	const { customerId, autumnV1, ctx, testClockId } = await initScenario({
		customerId: "p2p-remove-trial-ended",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
	});

	// Verify initially trialing
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerBefore,
		productId: proTrial.id,
	});

	// Advance past trial period (10 days to be safe)
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 10,
	});

	// After advancing, product should no longer be trialing
	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotTrialing({
		customer: customerAfterAdvance,
		productId: proTrial.id,
	});

	// Now try to remove trial (should be no-op since trial already ended)
	const updateParams = {
		customer_id: customerId,
		product_id: proTrial.id,
		items: [messagesItem, items.monthlyPrice()],
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
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
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

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "p2p-trial-carryover",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
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

	// next_cycle should align with existing trial (~14 days)
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: ms.days(14),
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

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "p2p-replace-trial",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
	});

	// Verify initially trialing (7 days)
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerBefore,
		productId: proTrial.id,
		trialEndsAt: Date.now() + ms.days(7),
	});

	// Replace with a new 30-day trial
	const updateParams = {
		customer_id: customerId,
		product_id: proTrial.id,
		items: [messagesItem, items.monthlyPrice()],
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
		startsAt: ms.days(30),
		total: items.monthlyPrice().price!,
	});

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should now have a 30-day trial
	await expectProductTrialing({
		customer,
		productId: proTrial.id,
		trialEndsAt: Date.now() + ms.days(30),
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 5. Paid product (no trial) → Paid product with trial, items undefined
test.concurrent(`${chalk.yellowBright("p2p-trial: paid no trial -> paid with trial, items undefined")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice();

	const pro = products.pro({
		items: [messagesItem, priceItem],
		id: "pro-no-trial",
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "p2p-trial-items-undefined",
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

	// Should be 0 during trial (trial being added)
	expect(preview.total).toEqual(0);

	// next_cycle should show when trial ends
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: ms.days(14),
		total: priceItem.price!,
	});

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Product should now be trialing
	await expectProductTrialing({
		customer,
		productId: pro.id,
		trialEndsAt: Date.now() + ms.days(14),
	});

	// Feature should still have correct values (unchanged since items undefined)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
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

	const proTrial = products.proWithTrial({
		items: [messagesItem],
		id: "pro-trial",
		trialDays: 7,
	});

	const { customerId, autumnV1, ctx, testClockId } = await initScenario({
		customerId: "p2p-new-trial-after-expired",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
	});

	// Verify initially trialing
	await expectProductTrialing({
		customerId,
		productId: proTrial.id,
	});

	// Advance past trial period
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 10,
	});

	// Verify no longer trialing
	await expectProductNotTrialing({
		customerId,
		productId: proTrial.id,
	});

	// Add a new 14-day trial
	const updateParams = {
		customer_id: customerId,
		product_id: proTrial.id,
		items: [messagesItem, items.monthlyPrice()],
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
			card_required: true,
			unique_fingerprint: false,
		},
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should be 0 during new trial
	expect(preview.total).toEqual(0);

	// next_cycle should show new 14-day trial end
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: ms.days(14),
		total: items.monthlyPrice().price!,
	});

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should now be trialing again with 14-day trial
	await expectProductTrialing({
		customer,
		productId: proTrial.id,
		trialEndsAt: Date.now() + ms.days(14),
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
