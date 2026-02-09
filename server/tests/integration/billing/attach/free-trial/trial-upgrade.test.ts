/**
 * Free Trial Upgrade Tests (Attach V2)
 *
 * Tests for upgrade scenarios where the new product's trial config applies.
 *
 * Key behaviors:
 * - UPGRADE: New product's trial config applies
 * - If new product has trial → Fresh trial starts
 * - If new product has NO trial → Trial ends, charge immediately
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";
import { timeout } from "@/utils/genUtils";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Upgrade from trialing pro to premium with trial (fresh trial)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has proWithTrial (7-day trial, currently trialing)
 * - Upgrade to premiumWithTrial (14-day trial)
 *
 * Expected Result:
 * - Fresh 14-day trial starts from upgrade time
 * - Old trial is replaced with new trial
 * - No charge during trial
 */
test.concurrent(`${chalk.yellowBright("trial-upgrade 1: trialing pro to premium with trial (fresh trial)")}`, async () => {
	const customerId = "trial-upgrade-pro-to-premium-trial";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [proMessagesItem],
		trialDays: 7,
		cardRequired: true,
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premiumTrial = products.premiumWithTrial({
		id: "premium-trial",
		items: [premiumMessagesItem],
		trialDays: 14,
		cardRequired: true,
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial, premiumTrial] }),
		],
		actions: [s.billing.attach({ productId: proTrial.id })],
	});

	// Verify initial state - pro is trialing
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerBefore,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	// 1. Preview upgrade - should show $0 (new trial), next_cycle = $50 at 14 days
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premiumTrial.id,
	});
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(14),
		total: 50, // Premium base price after fresh trial
	});

	// 2. Attach premium with trial (upgrade)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premiumTrial.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product states
	await expectCustomerProducts({
		customer,
		active: [premiumTrial.id],
		notPresent: [proTrial.id],
	});

	// Verify premium is trialing with FRESH 14-day trial
	await expectProductTrialing({
		customer,
		productId: premiumTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// Verify feature balance is premium's balance with resetsAt aligned to trial end
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 1000,
		balance: 1000,
		usage: 0,
		resetsAt: advancedTo + ms.days(14),
	});

	// Verify $0 invoice during trial (Stripe creates invoice for trial subscriptions)
	// Count is 2: initial trial ($0) + upgrade ($0)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
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
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Upgrade from trialing pro to premium without trial (trial ends)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has proWithTrial (7-day trial, currently trialing)
 * - Upgrade to premium (NO trial)
 *
 * Expected Result:
 * - Trial ends immediately
 * - Charged for premium ($50)
 */
test.concurrent(`${chalk.yellowBright("trial-upgrade 2: trialing pro to premium without trial (trial ends)")}`, async () => {
	const customerId = "trial-upgrade-pro-to-premium-no-trial";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [proMessagesItem],
		trialDays: 7,
		cardRequired: true,
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial, premium] }),
		],
		actions: [s.billing.attach({ productId: proTrial.id })],
	});

	const now = Date.now();
	// Verify initial state - pro is trialing
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerBefore,
		productId: proTrial.id,
		trialEndsAt: now + ms.days(7),
	});

	// 1. Preview upgrade - should show $50 (no trial, full charge)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});
	expect(preview.total).toBe(50);

	// 2. Attach premium without trial (upgrade - ends trial)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product states
	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [proTrial.id],
	});

	// Verify premium is NOT trialing
	await expectProductNotTrialing({
		customer,
		productId: premium.id,
		nowMs: advancedTo,
	});

	// Verify feature balance is premium's balance with resetsAt at billing cycle (no trial)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 1000,
		balance: 1000,
		usage: 0,
		resetsAt: addMonths(now, 1).getTime(),
	});

	// Verify invoice for premium
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
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
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Upgrade from non-trialing pro to premium with trial (fresh trial)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro ($20/mo, NOT trialing)
 * - Upgrade to premiumWithTrial (14-day trial)
 *
 * Expected Result:
 * - Fresh 14-day trial starts
 * - Existing pro charge is refunded (prorated credit)
 * - No new charge during trial
 */
test.concurrent(`${chalk.yellowBright("trial-upgrade 3: non-trialing pro to premium with trial")}`, async () => {
	const customerId = "trial-upgrade-notrial-to-trial";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premiumTrial = products.premiumWithTrial({
		id: "premium-trial",
		items: [premiumMessagesItem],
		trialDays: 14,
		cardRequired: true,
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premiumTrial] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Verify initial state - pro is NOT trialing
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotTrialing({
		customer: customerBefore,
		productId: pro.id,
		nowMs: advancedTo,
	});

	// 1. Preview upgrade - should show negative (refund for unused pro), next_cycle = $50
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premiumTrial.id,
	});
	// At start of cycle, full refund of pro: -$20
	expect(preview.total).toBe(-20);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(14),
		total: 50, // Premium price after fresh trial
	});

	// 2. Attach premium with trial (upgrade)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premiumTrial.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product states
	await expectCustomerProducts({
		customer,
		active: [premiumTrial.id],
		notPresent: [pro.id],
	});

	// Verify premium is trialing with fresh 14-day trial
	await expectProductTrialing({
		customer,
		productId: premiumTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// Verify feature balance is premium's balance with resetsAt aligned to trial end
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 1000,
		balance: 1000,
		usage: 0,
		resetsAt: advancedTo + ms.days(14),
	});

	await timeout(4000);
	// Verify invoices: pro charge ($20) + refund (-$20)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		invoiceIndex: 1,
		latestTotal: -20,
	});

	// Verify Stripe subscription state
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkTrialing: true },
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Mid-trial upgrade from pro to premium with trial (fresh trial)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has proWithTrial (7-day trial)
 * - Advance 3 days (mid-trial)
 * - Upgrade to premiumWithTrial (14-day trial)
 *
 * Expected Result:
 * - Fresh 14-day trial starts from upgrade time (NOT from original attach)
 * - Old partial trial is discarded
 * - No invoice generated (both trials are $0)
 */
test.concurrent(`${chalk.yellowBright("trial-upgrade 4: mid-trial upgrade to premium with trial (fresh trial)")}`, async () => {
	const customerId = "trial-upgrade-mid-trial-fresh";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [proMessagesItem],
		trialDays: 7,
		cardRequired: true,
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premiumTrial = products.premiumWithTrial({
		id: "premium-trial",
		items: [premiumMessagesItem],
		trialDays: 14,
		cardRequired: true,
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial, premiumTrial] }),
		],
		actions: [
			s.billing.attach({ productId: proTrial.id }),
			s.advanceTestClock({ days: 3 }), // Mid-trial: 4 days remaining
		],
	});

	// advancedTo is now 3 days after initial attach
	// Original pro trial would end at: advancedTo + 4 days (7 - 3 = 4 days remaining)

	// Verify pro is still trialing with 4 days remaining
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerBefore,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(4), // 4 days remaining from current time
	});

	// 1. Preview upgrade - should show $0 (new trial), next_cycle = $50 at 14 days FROM NOW
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premiumTrial.id,
	});
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(14), // Fresh 14-day trial from upgrade time
		total: 50,
	});

	// 2. Attach premium with trial (upgrade mid-trial)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premiumTrial.id,
		redirect_mode: "if_required",
	});

	await timeout(4000);
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product states
	await expectCustomerProducts({
		customer,
		active: [premiumTrial.id],
		notPresent: [proTrial.id],
	});

	// Verify premium has FRESH 14-day trial from upgrade time (NOT 4 days remaining)
	await expectProductTrialing({
		customer,
		productId: premiumTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// Verify feature balance is premium's balance with resetsAt aligned to new trial end
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 1000,
		balance: 1000,
		usage: 0,
		resetsAt: advancedTo + ms.days(14),
	});

	// Verify NO paid invoice generated - both are $0 trial invoices
	// Count is 2: initial trial ($0) + upgrade ($0)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
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
});
