/**
 * reset_after_trial_end Basic Tests (Attach V2)
 *
 * Tests for the reset_after_trial_end transition config parameter.
 *
 * Key behaviors:
 * - reset_after_trial_end: true → billing cycle starts AFTER trial ends (next_reset_at = trial_end + 30 days)
 * - reset_after_trial_end: false (default) → reset happens at trial end (next_reset_at = trial_end)
 * - Config is per-feature, applied at attach time only
 * - If no trial, the config has no effect (billing cycle starts from now)
 */

import { test } from "bun:test";
import { type ApiCustomerV3, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: reset_after_trial_end: true - billing cycle starts after trial
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Product has 7-day trial + monthly messages
 * - Attach with reset_after_trial_end: true for messages
 *
 * Expected Result:
 * - next_reset_at = advancedTo + 7 days + 30 days (billing cycle starts AFTER trial)
 * - NOT advancedTo + 7 days (trial end)
 */
test.concurrent(`${chalk.yellowBright("reset-after-trial-end 1: true - billing cycle starts after trial")}`, async () => {
	const customerId = "reset-trial-end-true";

	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial-reset",
		items: [messagesItem],
		trialDays: 7,
		cardRequired: true,
	});

	const { autumnV1, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [],
	});

	// Attach with reset_after_trial_end: true
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proTrial.id,
		redirect_mode: "if_required",
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: 500,
				reset_after_trial_end: true,
			},
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product is active and trialing
	await expectProductActive({ customer, productId: proTrial.id });
	await expectProductTrialing({
		customer,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	// Verify next_reset_at is trial end + 1 month (billing cycle starts AFTER trial)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
		resetsAt: addMonths(advancedTo + ms.days(7), 1).getTime(),
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: reset_after_trial_end: false - reset at trial end (default behavior)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Product has 7-day trial + monthly messages
 * - Attach with reset_after_trial_end: false for messages
 *
 * Expected Result:
 * - next_reset_at = advancedTo + 7 days (trial end)
 * - Same as default behavior
 */
test.concurrent(`${chalk.yellowBright("reset-after-trial-end 2: false - reset at trial end")}`, async () => {
	const customerId = "reset-trial-end-false";

	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial-no-reset",
		items: [messagesItem],
		trialDays: 7,
		cardRequired: true,
	});

	const { autumnV1, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [],
	});

	// Attach with reset_after_trial_end: false
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proTrial.id,
		redirect_mode: "if_required",
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: 500,
				reset_after_trial_end: false,
			},
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product is active and trialing
	await expectProductActive({ customer, productId: proTrial.id });
	await expectProductTrialing({
		customer,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	// Verify next_reset_at at trial end (default behavior)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
		resetsAt: advancedTo + ms.days(7), // Trial end
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: reset_after_trial_end: default (undefined) - reset at trial end
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Product has 7-day trial + monthly messages
 * - Attach WITHOUT specifying reset_after_trial_end
 *
 * Expected Result:
 * - Default behavior is false (reset at trial end)
 * - next_reset_at = advancedTo + 7 days (trial end)
 */
test.concurrent(`${chalk.yellowBright("reset-after-trial-end 3: default - reset at trial end")}`, async () => {
	const customerId = "reset-trial-end-default";

	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial-default",
		items: [messagesItem],
		trialDays: 7,
		cardRequired: true,
	});

	const { autumnV1, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [],
	});

	// Attach WITHOUT reset_after_trial_end config
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proTrial.id,
		redirect_mode: "if_required",
		// No options array - default behavior
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product is active and trialing
	await expectProductActive({ customer, productId: proTrial.id });
	await expectProductTrialing({
		customer,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	// Verify next_reset_at at trial end (default = false)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
		resetsAt: advancedTo + ms.days(7), // Default: trial end
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: reset_after_trial_end: true but no trial - no effect
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Product has NO trial + monthly messages
 * - Attach with reset_after_trial_end: true for messages
 *
 * Expected Result:
 * - Since there's no trial, the config has no effect
 * - next_reset_at = advancedTo + 30 days (normal billing cycle)
 */
test.concurrent(`${chalk.yellowBright("reset-after-trial-end 4: true but no trial - no effect")}`, async () => {
	const customerId = "reset-trial-end-no-trial";

	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro-no-trial",
		items: [messagesItem],
	});

	const { autumnV1, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// Attach with reset_after_trial_end: true (but product has no trial)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: 500,
				reset_after_trial_end: true,
			},
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product is active (no trial)
	await expectProductActive({ customer, productId: pro.id });

	// Verify next_reset_at at billing cycle (no trial, config has no effect)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
		resetsAt: addMonths(advancedTo, 1).getTime(), // Billing cycle (no trial)
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: reset_after_trial_end: per-feature config
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Product has 7-day trial + monthly messages + monthly words
 * - Attach with:
 *   - messages: reset_after_trial_end: true (billing cycle after trial)
 *   - words: reset_after_trial_end: false (reset at trial end)
 *
 * Expected Result:
 * - messages next_reset_at = advancedTo + 7 days + 30 days (trial end + cycle)
 * - words next_reset_at = advancedTo + 7 days (trial end)
 */
test.concurrent(`${chalk.yellowBright("reset-after-trial-end 5: per-feature config")}`, async () => {
	const customerId = "reset-trial-end-per-feature";

	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const wordsItem = items.monthlyWords({ includedUsage: 1000 });
	const proTrial = products.proWithTrial({
		id: "pro-trial-multi",
		items: [messagesItem, wordsItem],
		trialDays: 7,
		cardRequired: true,
	});

	const { autumnV1, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [],
	});

	// Attach with different configs per feature
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proTrial.id,
		redirect_mode: "if_required",
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: 500,
				reset_after_trial_end: true, // Billing cycle starts after trial
			},
			{
				feature_id: TestFeature.Words,
				quantity: 1000,
				reset_after_trial_end: false, // Reset at trial end
			},
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product is active and trialing
	await expectProductActive({ customer, productId: proTrial.id });
	await expectProductTrialing({
		customer,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	// Verify messages resets at trial end + 1 month (billing cycle after trial)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
		resetsAt: addMonths(advancedTo + ms.days(7), 1).getTime(),
	});

	// Verify words resets at trial end
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 1000,
		balance: 1000,
		usage: 0,
		resetsAt: advancedTo + ms.days(7), // Trial end
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: reset_after_trial_end on upgrade with trial
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has free product
 * - Upgrade to proWithTrial (7-day trial)
 * - Pass reset_after_trial_end: true
 *
 * Expected Result:
 * - Config is applied at upgrade time
 * - next_reset_at = advancedTo + 7 days + 30 days (trial end + billing cycle)
 */
test.concurrent(`${chalk.yellowBright("reset-after-trial-end 6: upgrade with trial + config")}`, async () => {
	const customerId = "reset-trial-end-upgrade";

	const freeMessagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free-upgrade-test",
		items: [freeMessagesItem],
	});

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial-upgrade",
		items: [proMessagesItem],
		trialDays: 7,
		cardRequired: true,
	});

	const { autumnV1, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, proTrial] }),
		],
		actions: [s.billing.attach({ productId: free.id })],
	});

	// Verify initial state on free product
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer: customerBefore, productId: free.id });

	// Upgrade to pro with trial and reset_after_trial_end: true
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proTrial.id,
		redirect_mode: "if_required",
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: 500,
				reset_after_trial_end: true,
			},
		],
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify upgraded to pro with trial
	await expectProductActive({
		customer: customerAfter,
		productId: proTrial.id,
	});
	await expectProductTrialing({
		customer: customerAfter,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	// Verify next_reset_at is trial end + 1 month (config applied at upgrade)
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
		resetsAt: addMonths(advancedTo + ms.days(7), 1).getTime(),
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: reset_after_trial_end: true with long trial (60 days > 1 month cycle)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Product has 60-day trial (longer than monthly billing cycle)
 * - Attach with reset_after_trial_end: true
 *
 * Expected Result:
 * - next_reset_at = trial_end + 1 month (60 days + ~30 days)
 * - The billing cycle starts AFTER the long trial ends
 */
test.concurrent(`${chalk.yellowBright("reset-after-trial-end 7: true with long trial (60 days)")}`, async () => {
	const customerId = "reset-trial-end-long-trial";

	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proLongTrial = products.proWithTrial({
		id: "pro-long-trial",
		items: [messagesItem],
		trialDays: 60, // 60-day trial (longer than 1 month cycle)
		cardRequired: true,
	});

	const { autumnV1, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proLongTrial] }),
		],
		actions: [],
	});

	// Attach with reset_after_trial_end: true
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proLongTrial.id,
		redirect_mode: "if_required",
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: 500,
				reset_after_trial_end: true,
			},
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product is active and trialing
	await expectProductActive({ customer, productId: proLongTrial.id });
	await expectProductTrialing({
		customer,
		productId: proLongTrial.id,
		trialEndsAt: advancedTo + ms.days(60),
		toleranceMs: ms.hours(3),
	});

	// Verify next_reset_at is trial end (60 days) + 1 month
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
		resetsAt: addMonths(advancedTo + ms.days(60), 1).getTime(),
		toleranceMs: ms.hours(3),
	});
});
