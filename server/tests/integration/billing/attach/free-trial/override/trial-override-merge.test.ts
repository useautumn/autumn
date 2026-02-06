/**
 * Free Trial Override Merge Tests (Attach V2)
 *
 * Tests for free_trial parameter override with add-ons and merges.
 *
 * Key behaviors:
 * - Add-on with free_trial override moves entire subscription to trial
 * - Add-on with free_trial: null ends subscription trial
 * - Add-on with free_trial override replaces existing trial
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, FreeTrialDuration, ms } from "@autumn/shared";
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

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Add-on with free_trial override to active subscription
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro (active, not trialing)
 * - Attaches add-on with free_trial: { length: 7 }
 *
 * Expected Result:
 * - Subscription moves to trial, both products trial
 * - Pro is refunded, no charge for add-on
 */
test.concurrent(`${chalk.yellowBright("trial-override-merge 1: add-on with free_trial override to active sub")}`, async () => {
	const customerId = "trial-override-merge-addon-active";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const addonItem = items.dashboard();
	const addon = products.recurringAddOn({
		id: "addon",
		items: [addonItem],
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Verify initial state - pro is active, not trialing
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotTrialing({
		customer: customerBefore,
		productId: pro.id,
		nowMs: advancedTo,
	});

	// 1. Preview add-on with free_trial override
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: addon.id,
		free_trial: {
			length: 7,
			duration: FreeTrialDuration.Day,
		},
	});
	// Pro refunded (-$20), add-on free during trial = -$20
	expect(preview.total).toBe(-20);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(7),
		total: 40, // Pro ($20) + Add-on ($20) after trial
	});

	// 2. Attach add-on with free_trial override
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: addon.id,
		free_trial: {
			length: 7,
			duration: FreeTrialDuration.Day,
		},
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify both products are active
	await expectCustomerProducts({
		customer,
		active: [pro.id, addon.id],
	});

	// Verify both products are trialing with same trial end
	await expectProductTrialing({
		customer,
		productId: pro.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	await expectProductTrialing({
		customer,
		productId: addon.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	// Verify invoices: pro ($20) + refund (-$20)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
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
// TEST 2: Add-on with free_trial: null to trialing subscription
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro (trialing)
 * - Attaches add-on with free_trial: null
 *
 * Expected Result:
 * - Trial ends, both products charged immediately
 */
test.concurrent(`${chalk.yellowBright("trial-override-merge 2: add-on with free_trial: null to trialing sub")}`, async () => {
	const customerId = "trial-override-merge-addon-null";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [proMessagesItem],
		trialDays: 14,
		cardRequired: true,
	});

	const addonItem = items.dashboard();
	const addon = products.recurringAddOn({
		id: "addon",
		items: [addonItem],
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial, addon] }),
		],
		actions: [s.billing.attach({ productId: proTrial.id })],
	});

	// Verify initial state - pro is trialing
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerBefore,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// 1. Preview add-on with free_trial: null
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: addon.id,
		free_trial: null,
	});
	// Pro ($20) + Add-on ($20) = $40
	expect(preview.total).toBe(40);

	// 2. Attach add-on with free_trial: null
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: addon.id,
		free_trial: null,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify both products are active
	await expectCustomerProducts({
		customer,
		active: [proTrial.id, addon.id],
	});

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

	// Verify invoices: $40 charge
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 40,
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
// TEST 3: Add-on with free_trial override to trialing subscription (replaces trial)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro (trialing, 5 days left)
 * - Attaches add-on with free_trial: { length: 14 }
 *
 * Expected Result:
 * - Fresh 14-day trial for both (replaces existing trial)
 */
test.concurrent(`${chalk.yellowBright("trial-override-merge 3: add-on with free_trial override replaces existing trial")}`, async () => {
	const customerId = "trial-override-merge-addon-replace";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [proMessagesItem],
		trialDays: 7,
		cardRequired: true,
	});

	const addonItem = items.dashboard();
	const addon = products.recurringAddOn({
		id: "addon",
		items: [addonItem],
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial, addon] }),
		],
		actions: [
			s.billing.attach({ productId: proTrial.id }),
			s.advanceTestClock({ days: 2 }), // 5 days remaining on trial
		],
	});

	// Verify initial state - pro is trialing with ~5 days remaining
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerBefore,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(5), // 7 - 2 = 5 days remaining
	});

	// 1. Preview add-on with free_trial override (14 days)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: addon.id,
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
		},
	});
	expect(preview.total).toBe(0); // No charge during trial
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(14), // Fresh 14-day trial
		total: 40, // Pro ($20) + Add-on ($20) after trial
	});

	// 2. Attach add-on with free_trial override
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: addon.id,
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
		},
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify both products are active
	await expectCustomerProducts({
		customer,
		active: [proTrial.id, addon.id],
	});

	// Verify both products have fresh 14-day trial (NOT the remaining 5 days)
	await expectProductTrialing({
		customer,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	await expectProductTrialing({
		customer,
		productId: addon.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// Verify $0 invoice during trial (Stripe creates invoice for trial subscriptions)
	// Count is 2: initial trial invoice ($0) + subscription update invoice ($0)
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
