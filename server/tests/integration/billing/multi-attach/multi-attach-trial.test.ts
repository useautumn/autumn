import type { MultiAttachParamsV0Input } from "@shared/api/billing/attachV2/multiAttachParamsV0";
/**
 * Multi-Attach Free Trial Tests
 *
 * Tests for trial behavior in multi-attach operations.
 *
 * Key behaviors:
 * - Trial inherited from product when no explicit free_trial param
 * - free_trial: null removes inherited trial
 * - Explicit free_trial param applies trial to products without one
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, FreeTrialDuration, ms } from "@autumn/shared";
import {
	expectCustomerFeatureCorrect,
	expectCustomerFeatureExists,
} from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// Test 1: Recurring product with free trial + add-on → trial inherited
//
// Scenario:
// - proTrial: $20/mo with 7-day trial + messages
// - addon: one-off add-on with dashboard (no trial)
// - No free_trial param passed
//
// Expected:
// - Trial inherited from proTrial's product config
// - Both products active, proTrial is trialing
// - Preview total = $10 (only one-off addon charged, recurring deferred)
// - Invoice total = $10 ($0 for trial sub + $10 for one-off addon)
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach trial 1: trial inherited from recurring product")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const dashboardItem = items.dashboard();

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [messagesItem],
		trialDays: 7,
		cardRequired: true,
	});
	const addon = products.oneOffAddOn({
		id: "addon",
		items: [dashboardItem],
	});

	const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
		customerId: "ma-trial-inherit",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial, addon] }),
		],
		actions: [],
	});

	const multiAttachParams = {
		customer_id: customerId,
		plans: [{ plan_id: proTrial.id }, { plan_id: addon.id }],
	};

	// 1. Preview — $0 (trial defers recurring) + $10 (one-off addon) = $10
	const preview = await autumnV1.billing.previewMultiAttach(multiAttachParams);
	expect(preview.total).toBeCloseTo(10, 0);

	// 2. Attach
	await autumnV1.billing.multiAttach(multiAttachParams);

	// 3. Verify
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [proTrial.id, addon.id],
	});

	// proTrial should be trialing
	await expectProductTrialing({
		customer,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 500,
	});

	await expectCustomerFeatureExists({
		customer,
		featureId: TestFeature.Dashboard,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════
// Test 2: Recurring with trial + add-on, free_trial: null → no trial
//
// Scenario:
// - proTrial: $20/mo with 7-day trial + messages
// - addon: one-off add-on with dashboard
// - Explicit free_trial: null passed
//
// Expected:
// - Trial suppressed despite product having one
// - Both products active, proTrial is NOT trialing
// - Preview total = $30 ($20 recurring + $10 one-off, charged immediately)
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach trial 2: free_trial null suppresses product trial")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const dashboardItem = items.dashboard();

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [messagesItem],
		trialDays: 7,
		cardRequired: true,
	});
	const addon = products.oneOffAddOn({
		id: "addon",
		items: [dashboardItem],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "ma-trial-null",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial, addon] }),
		],
		actions: [],
	});

	const multiAttachParams = {
		customer_id: customerId,
		plans: [{ plan_id: proTrial.id }, { plan_id: addon.id }],
		free_trial: null,
	};

	// 1. Preview — $20 (no trial, charged immediately) + $10 (one-off) = $30
	const preview = await autumnV1.billing.previewMultiAttach(multiAttachParams);
	expect(preview.total).toBeCloseTo(30, 0);

	// 2. Attach
	await autumnV1.billing.multiAttach(multiAttachParams);

	// 3. Verify
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [proTrial.id, addon.id],
	});

	// proTrial should NOT be trialing
	await expectProductNotTrialing({
		customer,
		productId: proTrial.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 500,
	});

	await expectCustomerFeatureExists({
		customer,
		featureId: TestFeature.Dashboard,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 30,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkNotTrialing: true },
	});
});

// ═══════════════════════════════════════════════════════════════════
// Test 3: Recurring without trial + add-on, explicit free_trial → trial applied
//
// Scenario:
// - pro: $20/mo with NO trial + messages
// - addon: one-off add-on with dashboard
// - Explicit free_trial: { length: 14, duration: "day" }
//
// Expected:
// - Trial applied from explicit param
// - Both products active, pro is trialing
// - Preview total = $10 (only one-off addon charged, recurring deferred)
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach trial 3: explicit free_trial param applies trial")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 300 });
	const dashboardItem = items.dashboard();

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});
	const addon = products.oneOffAddOn({
		id: "addon",
		items: [dashboardItem],
	});

	const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
		customerId: "ma-trial-explicit",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [],
	});

	const multiAttachParams: MultiAttachParamsV0Input = {
		customer_id: customerId,
		plans: [{ plan_id: pro.id }, { plan_id: addon.id }],
		free_trial: {
			duration_length: 14,
			duration_type: FreeTrialDuration.Day,
		},
	};

	// 1. Preview — $0 (trial defers recurring) + $10 (one-off addon) = $10
	const preview = await autumnV1.billing.previewMultiAttach(multiAttachParams);
	expect(preview.total).toBeCloseTo(10, 0);

	// 2. Attach
	await autumnV1.billing.multiAttach(multiAttachParams);

	// 3. Verify
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id, addon.id],
	});

	// pro should be trialing with 14-day trial
	await expectProductTrialing({
		customer,
		productId: pro.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 300,
	});

	await expectCustomerFeatureExists({
		customer,
		featureId: TestFeature.Dashboard,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
