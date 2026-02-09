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
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/**
 * Free Product with Trial Tests
 *
 * Tests for scenarios starting from free products with trials.
 * Covers free-to-free updates (preserving/extending/removing trials) and free-to-paid upgrades.
 * Uses `status === "trialing"` and `current_period_end` to verify trial state.
 */

// 1. Free to paid with `free_trial` param
test.concurrent(`${chalk.yellowBright("f2p-trial: add paid with free_trial param")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
		customerId: "f2p-trial-param",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free] }),
		],
		actions: [s.attach({ productId: "base" })],
	});

	// Track some usage before update
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 30,
		},
		{ timeout: 2000 },
	);

	const priceItem = items.monthlyPrice();

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [messagesItem, priceItem],
		free_trial: {
			length: 7,
			duration: FreeTrialDuration.Day,
			card_required: true,
			unique_fingerprint: false,
		},
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Preview total should be 0 during trial
	expect(preview.total).toEqual(0);

	// next_cycle should show when trial ends and what the charge will be
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(7),
		total: priceItem.price!,
	});

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product is trialing (status = "trialing", current_period_end is trial end)
	await expectProductTrialing({
		customer,
		productId: free.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	// Usage should be preserved
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage - 30,
		usage: 30,
	});

	// No immediate charge during trial
	expectCustomerInvoiceCorrect({
		customer,
		count: 1, // Just the $0 trial invoice
		latestTotal: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 2. Free product with trial, update mid-trial (no free_trial param) - trial preserved
test.concurrent(`${chalk.yellowBright("f2p-trial: free with trial -> free, update mid-trial preserves trial")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const freeWithTrial = products.baseWithTrial({
		items: [messagesItem],
		id: "free-trial",
		trialDays: 14,
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "f2p-trial-mid-update-preserve",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [freeWithTrial] }),
		],
		actions: [
			s.attach({ productId: freeWithTrial.id }),
			s.advanceTestClock({ days: 5 }), // Advance 5 days (mid-trial)
		],
	});

	// Verify initially trialing (get the trial end time before update)
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const initialTrialEnd = customerBefore.products?.find(
		(p) => p.id === freeWithTrial.id,
	)?.current_period_end;

	// Update mid-trial - change included usage (no free_trial param = keep existing trial)
	const updatedMessagesItem = items.monthlyMessages({ includedUsage: 200 });

	const updateParams = {
		customer_id: customerId,
		product_id: freeWithTrial.id,
		items: [updatedMessagesItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should be 0 (still free product)
	expect(preview.total).toEqual(0);

	// Free-to-free updates don't have next_cycle
	expectPreviewNextCycleCorrect({
		preview,
		expectDefined: false,
	});

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Trial should be preserved with same end date
	await expectProductTrialing({
		customer,
		productId: freeWithTrial.id,
		trialEndsAt: initialTrialEnd!,
	});

	// Feature updated, reset should align with trial end
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: updatedMessagesItem.included_usage,
		balance: updatedMessagesItem.included_usage,
		usage: 0,
	});

	// Note: Free-to-free tests don't need expectSubToBeCorrect (no Stripe subscription)
});

// 4. Free product with trial, update mid-trial WITH new free_trial param - trial extended
test.concurrent(`${chalk.yellowBright("f2p-trial: free with trial, update mid-trial extends trial")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const freeWithTrial = products.baseWithTrial({
		items: [messagesItem],
		id: "free-trial",
		trialDays: 14,
	});

	const { customerId, autumnV1, advancedTo } = await initScenario({
		customerId: "f2p-trial-mid-update-extend",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [freeWithTrial] }),
		],
		actions: [
			s.attach({ productId: freeWithTrial.id }),
			s.advanceTestClock({ days: 5 }), // Advance 5 days (mid-trial)
		],
	});

	// Get the initial trial end time before update
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const initialTrialEnd = customerBefore.products?.find(
		(p) => p.id === freeWithTrial.id,
	)?.current_period_end;

	// Update mid-trial WITH new free_trial param - extend to 30 days from now
	const updatedMessagesItem = items.monthlyMessages({ includedUsage: 200 });

	const updateParams = {
		customer_id: customerId,
		product_id: freeWithTrial.id,
		items: [updatedMessagesItem],
		free_trial: {
			length: 30,
			duration: FreeTrialDuration.Day,
			card_required: false,
			unique_fingerprint: false,
		},
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should be 0 (still free product)
	expect(preview.total).toEqual(0);

	// Free-to-free updates don't have next_cycle
	expectPreviewNextCycleCorrect({
		preview,
		expectDefined: false,
	});

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Trial should be extended to 30 days from advancedTo (test clock time)
	const newTrialEnd = await expectProductTrialing({
		customer,
		productId: freeWithTrial.id,
		trialEndsAt: advancedTo! + ms.days(30), // advancedTo + 30 day new trial
		toleranceMs: ms.days(1),
	});

	// New trial end should be later than original
	expect(newTrialEnd!).toBeGreaterThan(initialTrialEnd!);

	// Feature updated
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: updatedMessagesItem.included_usage,
		balance: updatedMessagesItem.included_usage,
		usage: 0,
	});

	// Note: Free-to-free tests don't need expectSubToBeCorrect (no Stripe subscription)
});

// 5. Free product with trial, update mid-trial to PAID product
test.concurrent(`${chalk.yellowBright("f2p-trial: free with trial, update mid-trial to paid")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const freeWithTrial = products.baseWithTrial({
		items: [messagesItem],
		id: "free-trial",
		trialDays: 14,
	});

	const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
		customerId: "f2p-trial-mid-update-to-paid",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [freeWithTrial] }),
		],
		actions: [
			s.attach({ productId: freeWithTrial.id }),
			s.advanceTestClock({ days: 5 }), // Advance 5 days (mid-trial)
		],
	});

	// Update mid-trial to PAID product (add price item)
	const priceItem = items.monthlyPrice();

	const updateParams = {
		customer_id: customerId,
		product_id: freeWithTrial.id,
		items: [messagesItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should charge full price since trial doesn't carry over
	expect(preview.total).toEqual(priceItem.price!);

	// next_cycle should be ~1 month from now (regular billing cycle)
	expectPreviewNextCycleCorrect({
		preview,
		expectDefined: false,
	});

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Trial should NOT carry over - product should no longer be trialing
	await expectProductNotTrialing({
		customer,
		productId: freeWithTrial.id,
		nowMs: advancedTo,
	});

	// Product should be active
	await expectProductActive({
		customer,
		productId: freeWithTrial.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 6. Free product (no trial) → Free product with trial, items undefined
test.concurrent(`${chalk.yellowBright("f2p-trial: free no trial -> free with trial, items undefined")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const free = products.base({
		items: [messagesItem],
		id: "free-no-trial",
	});

	const { customerId, autumnV1, advancedTo } = await initScenario({
		customerId: "f2p-trial-items-undefined",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free] }),
		],
		actions: [s.attach({ productId: free.id })],
	});

	// Verify initially NOT trialing
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotTrialing({
		customer: customerBefore,
		productId: free.id,
	});

	// Add trial without passing items (items undefined)
	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		// items is NOT specified (undefined)
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
			card_required: false,
			unique_fingerprint: false,
		},
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should be 0 (free product)
	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Product should now be trialing
	await expectProductTrialing({
		customer,
		productId: free.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// Feature should still have correct values (unchanged since items undefined)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
	});

	// Note: Free-to-free tests don't need expectSubToBeCorrect (no Stripe subscription)
});

// 7. Free product with trial, update mid-trial WITH free_trial: null - trial removed
test.concurrent(`${chalk.yellowBright("f2p-trial: free with trial, update mid-trial removes trial")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const freeWithTrial = products.baseWithTrial({
		items: [messagesItem],
		id: "free-trial",
		trialDays: 14,
	});

	const { customerId, autumnV1, advancedTo } = await initScenario({
		customerId: "f2p-trial-mid-update-remove",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [freeWithTrial] }),
		],
		actions: [
			s.attach({ productId: freeWithTrial.id }),
			s.advanceTestClock({ days: 5 }), // Advance 5 days (mid-trial)
		],
	});

	// Update mid-trial WITH free_trial: null - remove trial
	const updatedMessagesItem = items.monthlyMessages({ includedUsage: 200 });

	const updateParams = {
		customer_id: customerId,
		product_id: freeWithTrial.id,
		items: [updatedMessagesItem],
		free_trial: null,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should be 0 (still free product)
	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Product should no longer be trialing
	await expectProductNotTrialing({
		customer,
		productId: freeWithTrial.id,
		nowMs: advancedTo,
	});

	// Product should now be active
	await expectProductActive({
		customer,
		productId: freeWithTrial.id,
	});

	// Feature updated
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: updatedMessagesItem.included_usage,
		balance: updatedMessagesItem.included_usage,
		usage: 0,
	});

	// Note: Free-to-free tests don't need expectSubToBeCorrect (no Stripe subscription)
});
