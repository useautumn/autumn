/**
 * Free Trial Conversion Tests (Attach V2)
 *
 * Tests for trial end/conversion behaviors.
 *
 * Key behaviors:
 * - Trial end triggers first charge
 * - Billing cycle starts from trial end
 * - Features continue after conversion
 * - Arrears usage billed at trial end
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductNotTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Trial ends naturally - first charge
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has proWithTrial (7-day trial)
 * - Advance past trial end
 *
 * Expected Result:
 * - Product converts to active (not trialing)
 * - First charge of $20
 * - Features continue working
 */
test.concurrent(`${chalk.yellowBright("trial-conversion 1: trial ends naturally - first charge")}`, async () => {
	const customerId = "trial-conv-natural-end";

	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [messagesItem],
		trialDays: 7,
		cardRequired: true,
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [
			s.billing.attach({ productId: proTrial.id }),
			s.advanceTestClock({ toNextInvoice: true }), // Advance past trial
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product is active and NOT trialing
	await expectProductActive({
		customer,
		productId: proTrial.id,
	});

	await expectProductNotTrialing({
		customer,
		productId: proTrial.id,
		nowMs: advancedTo,
	});

	// Verify first charge invoice
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 20, // Pro base price
		latestInvoiceProductId: proTrial.id,
	});

	// Verify features still available with resetsAt aligned to monthly billing cycle
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500, // Reset after trial end
		usage: 0,
		resetsAt: advancedTo + ms.days(30),
	});

	// Verify Stripe subscription state
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkNotTrialing: true },
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Trial ends with usage - reset balances
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has proWithTrial with monthly messages
 * - Use some messages during trial
 * - Trial ends
 *
 * Expected Result:
 * - Balance resets at trial end (new billing cycle)
 * - First charge processed
 */
test.concurrent(`${chalk.yellowBright("trial-conversion 2: trial ends with usage - reset balances")}`, async () => {
	const customerId = "trial-conv-usage-reset";

	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [messagesItem],
		trialDays: 7,
		cardRequired: true,
	});

	const { autumnV1, ctx, advancedTo, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.billing.attach({ productId: proTrial.id })],
	});

	// Use some messages during trial
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 200,
	});

	// Wait for track to sync
	await new Promise((r) => setTimeout(r, 2000));

	// Verify usage during trial
	const customerDuringTrial =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerDuringTrial,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 300, // 500 - 200 = 300
		usage: 200,
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proTrial.id,
	});

	const advancedToAfter = await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		currentEpochMs: advancedTo,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product is NOT trialing
	await expectProductNotTrialing({
		customer,
		productId: proTrial.id,
		nowMs: advancedToAfter,
	});

	// Verify balance reset (new billing cycle)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500, // Reset to full
		usage: 0, // Reset to 0
	});

	// Verify first charge
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 20,
		latestInvoiceProductId: proTrial.id,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Trial ends with add-on - both products charged
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has proWithTrial (trialing) + add-on (inheriting trial)
 * - Trial ends
 *
 * Expected Result:
 * - Both products charged: pro ($20) + add-on ($20) = $40
 */
test.concurrent(`${chalk.yellowBright("trial-conversion 4: trial ends with add-on - both charged")}`, async () => {
	const customerId = "trial-conv-with-addon";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [proMessagesItem],
		trialDays: 7,
		cardRequired: true,
	});

	const addonItem = items.dashboard();
	const addonWords = items.monthlyWords({ includedUsage: 100 });
	const addon = products.recurringAddOn({
		id: "addon",
		items: [addonItem, addonWords],
	});

	let { autumnV1, ctx, advancedTo, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial, addon] }),
		],
		actions: [
			s.billing.attach({ productId: proTrial.id }),
			s.advanceTestClock({ days: 3 }),
			s.billing.attach({ productId: addon.id, timeout: 4000 }),
		],
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: 0,
		latestInvoiceProductIds: [addon.id],
	});

	const customerAfterAddonAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer: customerAfterAddonAttach,
		featureId: TestFeature.Words,
		includedUsage: 100,
		balance: 100,
		usage: 0,
		resetsAt: advancedTo + ms.days(4),
	});

	advancedTo = await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 14,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify both products are NOT trialing
	await expectProductNotTrialing({
		customer,
		productId: proTrial.id,
		nowMs: advancedTo,
	});

	await expectProductNotTrialing({
		customer,
		productId: addon.id,
		nowMs: advancedTo,
	});

	// Verify first charge includes both products
	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		latestTotal: 40, // Pro ($20) + Add-on ($20)
	});

	// Verify Stripe subscription state
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkNotTrialing: true },
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Scheduled downgrade activates after trial ends
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has premiumWithTrial (trialing)
 * - Downgrade to pro (scheduled for trial end)
 * - Trial ends
 *
 * Expected Result:
 * - Pro becomes active (not premium)
 * - Pro price charged ($20, not $50)
 */
test.concurrent(`${chalk.yellowBright("trial-conversion 5: scheduled downgrade activates after trial")}`, async () => {
	const customerId = "trial-conv-scheduled-downgrade";

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premiumTrial = products.premiumWithTrial({
		id: "premium-trial",
		items: [premiumMessagesItem],
		trialDays: 14,
		cardRequired: true,
	});

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premiumTrial, pro] }),
		],
		actions: [
			s.billing.attach({ productId: premiumTrial.id }),
			s.billing.attach({ productId: pro.id }), // Downgrade - scheduled
			s.advanceTestClock({ toNextInvoice: true }),
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify pro is active (not premium)
	await expectProductActive({
		customer,
		productId: pro.id,
	});

	// Verify premium is no longer present
	const hasPremium = customer.products.some((p) => p.id === premiumTrial.id);
	expect(hasPremium).toBe(false);

	// Verify pro is NOT trialing
	await expectProductNotTrialing({
		customer,
		productId: pro.id,
		nowMs: advancedTo,
	});

	// Verify pro price charged (not premium)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 20, // Pro price, not premium
		latestInvoiceProductId: pro.id,
	});

	// Verify feature balance is pro's balance with resetsAt aligned to monthly billing cycle
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
		resetsAt: Date.now() + ms.days(14) + ms.days(30),
	});

	// Verify Stripe subscription state
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkNotTrialing: true },
	});
});
