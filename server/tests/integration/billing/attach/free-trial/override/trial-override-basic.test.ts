/**
 * Free Trial Override Basic Tests (Attach V2)
 *
 * Tests for basic free_trial parameter override behaviors.
 *
 * Key behaviors:
 * - free_trial param overrides product's trial config
 * - free_trial param bypasses deduplication logic
 * - Trial always starts from now + trial_days
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, FreeTrialDuration, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Fresh attach with free_trial override (product has no trial config)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Product has no trial configuration
 * - Attach with free_trial: { length: 7, duration: "day" }
 *
 * Expected Result:
 * - Trial starts, ends at now + 7 days
 * - No immediate charge
 * - Preview next_cycle shows correct trial end and charge
 */
test.concurrent(`${chalk.yellowBright("trial-override-basic 1: fresh attach with free_trial override")}`, async () => {
	const customerId = "trial-override-basic-fresh";

	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [messagesItem, priceItem],
		// No trial config
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// 1. Preview attach with free_trial override
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		free_trial: {
			length: 7,
			duration: FreeTrialDuration.Day,
		},
	});
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(7),
		total: 20,
	});

	// 2. Attach with free_trial override
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		free_trial: {
			length: 7,
			duration: FreeTrialDuration.Day,
		},
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product is active and trialing
	await expectProductActive({
		customer,
		productId: pro.id,
	});

	await expectProductTrialing({
		customer,
		productId: pro.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	// Verify features available with resetsAt aligned to trial end
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
		resetsAt: advancedTo + ms.days(7), // Reset aligns with trial end
	});

	// Verify $0 invoice during trial (Stripe creates invoice for trial subscriptions)
	expectCustomerInvoiceCorrect({
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
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Override product's trial config
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Product has 14-day trial configuration
 * - Attach with free_trial: { length: 30, duration: "day" }
 *
 * Expected Result:
 * - Trial uses override (30 days), NOT product config (14 days)
 */
test.concurrent(`${chalk.yellowBright("trial-override-basic 2: override product's trial config")}`, async () => {
	const customerId = "trial-override-basic-override-config";

	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [messagesItem],
		trialDays: 14, // Product config: 14 days
		cardRequired: true,
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [],
	});

	// 1. Preview attach with override (30 days instead of 14)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proTrial.id,
		free_trial: {
			length: 30,
			duration: FreeTrialDuration.Day,
		},
	});
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(30), // Override, not product config
		total: 20,
	});

	// 2. Attach with override
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proTrial.id,
		free_trial: {
			length: 30,
			duration: FreeTrialDuration.Day,
		},
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify trial uses override (30 days), NOT product config (14 days)
	await expectProductTrialing({
		customer,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(30),
	});

	// Verify feature reset aligns with overridden trial (30 days, not 14)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
		resetsAt: advancedTo + ms.days(30), // Reset aligns with override, not product config
	});

	// Verify $0 invoice during trial (Stripe creates invoice for trial subscriptions)
	expectCustomerInvoiceCorrect({
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
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Override bypasses deduplication (reattach after cancel)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer previously had trial, used it, then cancelled
 * - Reattach with free_trial override
 *
 * Expected Result:
 * - Gets fresh trial (deduplication bypassed)
 */
test.concurrent(`${chalk.yellowBright("trial-override-basic 3: override bypasses deduplication")}`, async () => {
	const customerId = "trial-override-basic-bypass-dedup";

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
			s.advanceTestClock({ days: 3 }), // Mid-trial
			s.updateSubscription({
				productId: proTrial.id,
				cancelAction: "cancel_immediately" as const,
			}),
		],
	});

	// Verify product is cancelled
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const hasProduct = customerBefore.products.some(
		(p) => p.id === proTrial.id && p.status === "active",
	);
	expect(hasProduct).toBe(false);

	// 1. Preview reattach with free_trial override (bypasses dedup)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proTrial.id,
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
		},
	});
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(14),
		total: 20,
	});

	// 2. Reattach with free_trial override
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proTrial.id,
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
		},
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify gets fresh 14-day trial (deduplication bypassed)
	await expectProductActive({
		customer,
		productId: proTrial.id,
	});

	await expectProductTrialing({
		customer,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// Verify feature reset aligns with fresh trial (14 days from now)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
		resetsAt: advancedTo + ms.days(14), // Fresh trial, reset at trial end
	});

	// Verify $0 invoice during trial (Stripe creates invoice for trial subscriptions)
	expectCustomerInvoiceCorrect({
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
