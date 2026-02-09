/**
 * Free Trial Override Upgrade Tests (Attach V2)
 *
 * Tests for free_trial parameter override during upgrades.
 *
 * Key behaviors:
 * - Upgrade with free_trial override starts fresh trial
 * - Upgrade with free_trial: null prevents trial
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, FreeTrialDuration, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
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

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Upgrade with free_trial override (customer is active, not trialing)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on Pro (active, not trialing)
 * - Upgrades to Premium with free_trial: { length: 14 }
 *
 * Expected Result:
 * - Premium starts 14-day trial
 * - Pro is replaced, customer refunded
 */
test.concurrent(`${chalk.yellowBright("trial-override-upgrade 1: upgrade active customer with free_trial override")}`, async () => {
	const customerId = "trial-override-upgrade-active";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
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
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Verify initial state - pro is active, not trialing
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerBefore,
		productId: pro.id,
	});
	await expectProductNotTrialing({
		customer: customerBefore,
		productId: pro.id,
		nowMs: advancedTo,
	});

	// 1. Preview upgrade with free_trial override
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
		},
	});
	// Should refund Pro ($20) and not charge for Premium during trial
	expect(preview.total).toBe(-20);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(14),
		total: 50, // Premium price after trial
	});

	// 2. Upgrade with free_trial override
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
		},
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product states
	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// Verify premium is trialing
	await expectProductTrialing({
		customer,
		productId: premium.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// Verify features with resetsAt aligned to new trial end
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 1000,
		balance: 1000,
		usage: 0,
		resetsAt: advancedTo + ms.days(14), // Reset changed to new trial end
	});

	// Verify invoices: initial pro ($20) + refund (-$20)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		latestTotal: 0,
	});

	expect(customer.invoices?.[1]?.total).toBe(-20);

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
// TEST 2: Upgrade with free_trial: null (product has trial config)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on Pro (active)
 * - Upgrades to Premium (has 14-day trial config) with free_trial: null
 *
 * Expected Result:
 * - No trial, charged immediately
 */
test.concurrent(`${chalk.yellowBright("trial-override-upgrade 2: upgrade with free_trial: null (no trial)")}`, async () => {
	const customerId = "trial-override-upgrade-null";

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

	// 1. Preview upgrade with free_trial: null
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premiumTrial.id,
		free_trial: null,
	});
	// Premium ($50) - Pro refund ($20) = $30
	expect(preview.total).toBe(30);

	// 2. Upgrade with free_trial: null
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premiumTrial.id,
		free_trial: null,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product states
	await expectCustomerProducts({
		customer,
		active: [premiumTrial.id],
		notPresent: [pro.id],
	});

	// Verify premium is NOT trialing
	await expectProductNotTrialing({
		customer,
		productId: premiumTrial.id,
		nowMs: advancedTo,
	});

	// Verify features with resetsAt at normal billing cycle (no trial)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 1000,
		balance: 1000,
		usage: 0,
		resetsAt: addMonths(advancedTo, 1).getTime(),
	});

	// Verify invoices: pro ($20) + upgrade ($30)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 30,
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
