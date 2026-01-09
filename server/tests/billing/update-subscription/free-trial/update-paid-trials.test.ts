import { expect, test } from "bun:test";
import { type ApiCustomerV3, FreeTrialDuration, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/billing/utils/expectCustomerProductCorrect";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/billing/utils/expectCustomerProductTrialing";
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

	const { customerId, autumnV1, ctx } = await initScenario({
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
		trialEndsAfter: ms.days(6),
		trialEndsBefore: ms.days(8),
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
		},
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should be 0 during trial
	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should now have a 30-day trial
	await expectProductTrialing({
		customer,
		productId: proTrial.id,
		trialEndsAfter: ms.days(29), // At least 29 days from now
		trialEndsBefore: ms.days(31), // At most 31 days from now
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 5. New trial after old expired
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
		},
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should be 0 during new trial
	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should now be trialing again with 14-day trial
	await expectProductTrialing({
		customer,
		productId: proTrial.id,
		trialEndsAfter: ms.days(13),
		trialEndsBefore: ms.days(15),
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
