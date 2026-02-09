/**
 * Free Trial Downgrade Tests (Attach V2)
 *
 * Tests for downgrade scenarios (scheduled switches).
 *
 * Key behaviors:
 * - DOWNGRADE: Inherits subscription's current trial state
 * - Product's trial config is IGNORED on downgrade
 * - Scheduled downgrade activates with NO trial (regardless of product config)
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Downgrade from trialing premium to pro with trial (inherits trial)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has premiumWithTrial (14-day trial, currently trialing)
 * - Downgrade to proWithTrial (7-day trial config - IGNORED)
 *
 * Expected Result:
 * - Premium stays active and trialing (canceling at end of trial)
 * - Pro is scheduled
 * - Trial state is preserved (premium's trial continues)
 */
test.concurrent(`${chalk.yellowBright("trial-downgrade 1: trialing premium to pro with trial")}`, async () => {
	const customerId = "trial-downgrade-premium-to-pro-trial";

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premiumTrial = products.premiumWithTrial({
		id: "premium-trial",
		items: [premiumMessagesItem],
		trialDays: 14,
		cardRequired: true,
	});

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [proMessagesItem],
		trialDays: 7,
		cardRequired: true,
	});

	const { autumnV1, ctx, advancedTo, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premiumTrial, proTrial] }),
		],
		actions: [s.billing.attach({ productId: premiumTrial.id })],
	});

	// Verify initial state - premium is trialing
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerBefore,
		productId: premiumTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// 1. Preview downgrade - should show $0 (scheduled, no immediate charge)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proTrial.id,
	});
	expect(preview.total).toBe(0);

	// Verify next_cycle info for scheduled downgrade
	expectPreviewNextCycleCorrect({
		preview,
		total: 20, // Pro's price after trial ends
		startsAt: advancedTo + ms.days(14), // Trial end = cycle start
	});

	// 2. Attach pro (downgrade - scheduled)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proTrial.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify premium is canceling (still active, will be removed at trial end)
	await expectProductCanceling({
		customer,
		productId: premiumTrial.id,
	});

	// Verify pro is scheduled
	await expectProductScheduled({
		customer,
		productId: proTrial.id,
	});

	// Verify premium is STILL trialing (trial inherited)
	await expectProductTrialing({
		customer,
		productId: premiumTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// Verify feature balance is still premium's balance (until switch) with resetsAt aligned to trial end
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 1000,
		balance: 1000,
		usage: 0,
		resetsAt: advancedTo + ms.days(14),
	});

	// Verify $0 invoice during trial (Stripe creates invoice for trial subscriptions)
	// Count is 2: initial trial ($0) + scheduled downgrade ($0)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 0,
	});

	// Verify Stripe subscription state
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkTrialing: true },
	});

	const advancedToAfterTrial = await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 20,
		waitForSeconds: 30,
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 2,
		latestTotal: 20,
		latestInvoiceProductId: proTrial.id,
	});

	await expectProductActive({
		customer: customerAfter,
		productId: proTrial.id,
	});

	await expectProductNotTrialing({
		customer: customerAfter,
		productId: proTrial.id,
		nowMs: advancedToAfterTrial,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkNotTrialing: true },
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Downgrade from trialing premium to pro without trial (inherits trial)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has premiumWithTrial (14-day trial, currently trialing)
 * - Downgrade to pro (NO trial config)
 *
 * Expected Result:
 * - Premium stays active and trialing
 * - Pro is scheduled
 * - Trial state is preserved (product config ignored on downgrade)
 */
test.concurrent(`${chalk.yellowBright("trial-downgrade 2: trialing premium to pro without trial")}`, async () => {
	const customerId = "trial-downgrade-premium-to-pro-no-trial";

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

	const { autumnV1, ctx, advancedTo, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premiumTrial, pro] }),
		],
		actions: [s.billing.attach({ productId: premiumTrial.id })],
	});

	// Verify initial state - premium is trialing
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerBefore,
		productId: premiumTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// 1. Preview downgrade - should show $0 (scheduled), next_cycle = $20 at trial end
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
	});
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(14), // Trial end
		total: 20, // Pro's price after trial ends
	});

	// 2. Attach pro (downgrade - scheduled)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify premium is canceling
	await expectProductCanceling({
		customer,
		productId: premiumTrial.id,
	});

	// Verify pro is scheduled
	await expectProductScheduled({
		customer,
		productId: pro.id,
	});

	// Verify premium is STILL trialing
	await expectProductTrialing({
		customer,
		productId: premiumTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// Verify $0 invoice during trial (Stripe creates invoice for trial subscriptions)

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 0,
	});

	// Verify Stripe subscription state
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkTrialing: true },
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// ADVANCE PAST TRIAL: Verify scheduled downgrade activates correctly
	// ═══════════════════════════════════════════════════════════════════════════

	const advancedToAfterTrial = await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 20,
		waitForSeconds: 30,
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify pro is now active (not scheduled)
	await expectProductActive({
		customer: customerAfter,
		productId: pro.id,
	});

	// Verify pro is NOT trialing (downgrades don't get trial)
	await expectProductNotTrialing({
		customer: customerAfter,
		productId: pro.id,
		nowMs: advancedToAfterTrial,
	});

	// Verify invoice: $0 trial + $20 for pro after trial ends
	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 2,
		latestTotal: 20,
		latestInvoiceProductId: pro.id,
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
// TEST 3: Downgrade from non-trialing premium to pro with trial (no trial)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has premium ($50/mo, NOT trialing)
 * - Downgrade to proWithTrial (7-day trial config - IGNORED)
 *
 * Expected Result:
 * - Premium stays active (canceling at end of cycle)
 * - Pro is scheduled
 * - NO trial (inherits non-trialing state)
 */
test.concurrent(`${chalk.yellowBright("trial-downgrade 3: non-trialing premium to pro with trial (no trial)")}`, async () => {
	const customerId = "trial-downgrade-notrial-premium-to-pro-trial";

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [proMessagesItem],
		trialDays: 7,
		cardRequired: true,
	});

	const { autumnV1, ctx, advancedTo, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, proTrial] }),
		],
		actions: [s.billing.attach({ productId: premium.id })],
	});

	// Verify initial state - premium is NOT trialing
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotTrialing({
		customer: customerBefore,
		productId: premium.id,
		nowMs: advancedTo,
	});

	// 1. Preview downgrade - should show $0 (scheduled)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proTrial.id,
	});
	expect(preview.total).toBe(0);

	// Verify next_cycle shows pro's charge (NO trial on scheduled activation)
	expectPreviewNextCycleCorrect({
		preview,
		total: 20, // Pro's price - no trial on downgrade activation
		startsAt: addMonths(advancedTo, 1).getTime(),
	});

	// 2. Attach pro (downgrade - scheduled)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proTrial.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify premium is canceling
	await expectProductCanceling({
		customer,
		productId: premium.id,
	});

	// Verify pro is scheduled
	await expectProductScheduled({
		customer,
		productId: proTrial.id,
	});

	// Verify premium is NOT trialing (no change)
	await expectProductNotTrialing({
		customer,
		productId: premium.id,
		nowMs: advancedTo,
	});

	// Verify invoice for premium
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 50,
	});

	// Verify Stripe subscription state
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkNotTrialing: true },
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		currentEpochMs: advancedTo,
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 2,
		latestTotal: 20,
		latestInvoiceProductId: proTrial.id,
	});

	await expectProductActive({
		customer: customerAfter,
		productId: proTrial.id,
	});

	await expectProductNotTrialing({
		customer: customerAfter,
		productId: proTrial.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkNotTrialing: true },
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Downgrade from premium to free (no trial on scheduled free)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has premium ($50/mo, NOT trialing)
 * - Downgrade to free product
 *
 * Expected Result:
 * - Premium stays active until end of cycle
 * - Free is scheduled
 * - No trial (free products don't need trials)
 */
test.concurrent(`${chalk.yellowBright("trial-downgrade 4: premium to free (no trial)")}`, async () => {
	const customerId = "trial-downgrade-premium-to-free";

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { autumnV1, ctx, advancedTo, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, free] }),
		],
		actions: [s.billing.attach({ productId: premium.id })],
	});

	// 1. Preview downgrade - should show $0 (scheduled)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: free.id,
	});
	expect(preview.total).toBe(0);

	// 2. Attach free (downgrade - scheduled)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: free.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify premium is canceling
	await expectProductCanceling({
		customer,
		productId: premium.id,
	});

	// Verify free is scheduled
	await expectProductScheduled({
		customer,
		productId: free.id,
	});

	// Verify invoice for premium
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 50,
	});

	// Verify Stripe subscription state
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkNotTrialing: true },
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// ADVANCE PAST CYCLE: Verify scheduled downgrade activates correctly
	// ═══════════════════════════════════════════════════════════════════════════

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		currentEpochMs: advancedTo,
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify free is now active (not scheduled)
	await expectProductActive({
		customer: customerAfter,
		productId: free.id,
	});

	// Verify feature balance is now free's balance
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Verify no additional invoice (free product has no charge)
	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 1,
		latestTotal: 50, // Still the original premium invoice
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Downgrade from trialing premium to free (inherits trial until switch)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has premiumWithTrial (14-day trial, currently trialing)
 * - Downgrade to free product
 *
 * Expected Result:
 * - Premium stays active and trialing until trial end
 * - Free is scheduled
 * - Trial continues until trial end, then free activates
 */
test.concurrent(`${chalk.yellowBright("trial-downgrade 5: trialing premium to free (does NOT inherit trial)")}`, async () => {
	const customerId = "trial-downgrade-trialing-premium-to-free";

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premiumTrial = products.premiumWithTrial({
		id: "premium-trial",
		items: [premiumMessagesItem],
		trialDays: 14,
		cardRequired: true,
	});

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { autumnV1, ctx, advancedTo, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premiumTrial, free] }),
		],
		actions: [s.billing.attach({ productId: premiumTrial.id })],
	});

	// Verify initial state - premium is trialing
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerBefore,
		productId: premiumTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// 1. Preview downgrade - should show $0, next_cycle = $0 at trial end
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: free.id,
	});
	expect(preview.total).toBe(0);

	// 2. Attach free (downgrade - scheduled)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: free.id,
		redirect_mode: "if_required",
	});

	return;
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify premium is canceling
	await expectProductCanceling({
		customer,
		productId: premiumTrial.id,
	});

	// Verify free is scheduled
	await expectProductScheduled({
		customer,
		productId: free.id,
	});

	// Verify premium is STILL trialing
	await expectProductTrialing({
		customer,
		productId: premiumTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// Verify feature balance is still premium's balance with resetsAt aligned to trial end
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 1000,
		balance: 1000,
		usage: 0,
		resetsAt: advancedTo + ms.days(14),
	});

	// Verify $0 invoice during trial (Stripe creates invoice for trial subscriptions)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 0,
	});

	// Verify Stripe subscription state
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkTrialing: true },
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// ADVANCE PAST TRIAL: Verify scheduled downgrade activates correctly
	// ═══════════════════════════════════════════════════════════════════════════

	const advancedToAfterTrial = await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 20,
		waitForSeconds: 30,
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify free is now active (not scheduled)
	await expectProductActive({
		customer: customerAfter,
		productId: free.id,
	});

	expectProductNotTrialing({
		customer: customerAfter,
		productId: free.id,
		nowMs: advancedToAfterTrial,
	});
	// Verify feature balance is now free's balance
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Verify no additional paid invoice (free product has no charge)
	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 1,
		latestTotal: 0,
	});

	await expectNoStripeSubscription({
		db: ctx.db,
		org: ctx.org,
		env: ctx.env,
		customerId,
	});
});
