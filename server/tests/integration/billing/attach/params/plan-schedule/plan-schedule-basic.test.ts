/**
 * Plan Schedule Basic Tests (Attach V2)
 *
 * Tests for plan_schedule parameter override behavior.
 *
 * Key behaviors:
 * - plan_schedule: "end_of_cycle" on upgrade creates scheduled upgrade (not immediate)
 * - plan_schedule: "immediate" on downgrade activates new product immediately (not scheduled)
 * - Scheduled upgrades can be replaced by immediate upgrades
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Upgrade with plan_schedule: "end_of_cycle" (scheduled upgrade)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro ($20/mo)
 * - Upgrade to premium ($50/mo) with plan_schedule: "end_of_cycle"
 *
 * Expected Result:
 * - Pro remains active (not canceling since it's an upgrade)
 * - Premium is scheduled for end of cycle
 * - No immediate charge (preview.total = 0)
 * - next_cycle.total = $50
 */
test.concurrent(`${chalk.yellowBright("plan-schedule-basic 1: upgrade with end_of_cycle")}`, async () => {
	const customerId = "plan-sched-upgrade-eoc";

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

	// Verify initial subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// 1. Preview scheduled upgrade - no immediate charge
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		plan_schedule: "end_of_cycle",
	});
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		total: 50,
		startsAt: addMonths(advancedTo, 1).getTime(),
	});

	// 2. Execute scheduled upgrade
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		plan_schedule: "end_of_cycle",
		redirect_mode: "if_required",
	});

	const customerMidCycle =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Pro should be canceling (will end at cycle end)
	await expectProductCanceling({
		customer: customerMidCycle,
		productId: pro.id,
	});

	// Premium should be scheduled
	await expectProductScheduled({
		customer: customerMidCycle,
		productId: premium.id,
	});

	// Pro's features still active until cycle end
	expectCustomerFeatureCorrect({
		customer: customerMidCycle,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	// Verify subscription after scheduling
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Only 1 invoice (initial pro attach) - no upgrade charge yet
	await expectCustomerInvoiceCorrect({
		customer: customerMidCycle,
		count: 1,
		latestTotal: 20,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Downgrade with plan_schedule: "immediate" (immediate downgrade)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has premium ($50/mo)
 * - Downgrade to pro ($20/mo) with plan_schedule: "immediate"
 *
 * Expected Result:
 * - Pro is immediately active
 * - Premium is removed
 * - Credit issued for unused premium time (~$30 prorated)
 */
test.concurrent(`${chalk.yellowBright("plan-schedule-basic 2: downgrade with immediate")}`, async () => {
	const customerId = "plan-sched-downgrade-imm";

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

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: premium.id })],
	});

	// Verify initial subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// 1. Preview immediate downgrade - should show credit
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		plan_schedule: "immediate",
	});
	// Immediate downgrade: charge for pro ($20) minus credit for unused premium (~$50)
	// Net should be negative or small positive depending on proration
	expect(preview.total).toBeLessThan(20);

	// 2. Execute immediate downgrade
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		plan_schedule: "immediate",
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Pro should be immediately active
	await expectProductActive({
		customer,
		productId: pro.id,
	});

	// Premium should be gone
	await expectProductNotPresent({
		customer,
		productId: premium.id,
	});

	// Features updated to pro tier immediately
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	// Verify subscription after immediate downgrade
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Advance after scheduled upgrade
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro ($20/mo)
 * - Schedule upgrade to premium with plan_schedule: "end_of_cycle"
 * - Advance test clock to next billing cycle
 *
 * Expected Result:
 * - Premium becomes active
 * - Pro is removed
 * - Invoice for $50 (premium)
 */
test.concurrent(`${chalk.yellowBright("plan-schedule-basic 3: advance after scheduled upgrade")}`, async () => {
	const customerId = "plan-sched-advance-upgrade";

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

	// Setup with scheduled upgrade, then advance
	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.billing.attach({ productId: premium.id, planSchedule: "end_of_cycle" }),
			s.advanceToNextInvoice(),
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// After cycle: premium active, pro gone
	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// Features updated to premium tier
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 1000,
		balance: 1000,
		usage: 0,
	});

	// Verify subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Invoices: pro ($20) + premium renewal ($50)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 50,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Scheduled upgrade then immediate upgrade override
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro ($20/mo)
 * - Schedule upgrade to premium with plan_schedule: "end_of_cycle"
 * - Immediate upgrade to growth ($100/mo) with plan_schedule: "immediate"
 *
 * Expected Result:
 * - Growth is immediately active
 * - Scheduled premium is cleared
 * - Pro is removed
 * - Prorated charge for growth
 */
test.concurrent(`${chalk.yellowBright("plan-schedule-basic 4: scheduled upgrade then immediate upgrade")}`, async () => {
	const customerId = "plan-sched-override-upgrade";

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

	const growthMessagesItem = items.monthlyMessages({ includedUsage: 2000 });
	const growth = products.growth({
		id: "growth",
		items: [growthMessagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium, growth] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.billing.attach({ productId: premium.id, planSchedule: "end_of_cycle" }),
		],
	});

	// Verify mid-state: pro canceling, premium scheduled
	const customerMidCycle =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerMidCycle,
		productId: pro.id,
	});
	await expectProductScheduled({
		customer: customerMidCycle,
		productId: premium.id,
	});

	// Now do immediate upgrade to growth - this should clear the schedule
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: growth.id,
		plan_schedule: "immediate",
	});
	// Immediate upgrade: should charge prorated amount
	expect(preview.total).toBeGreaterThan(0);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: growth.id,
		plan_schedule: "immediate",
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Growth should be immediately active
	await expectProductActive({
		customer,
		productId: growth.id,
	});

	// Pro and premium should be gone
	await expectProductNotPresent({
		customer,
		productId: pro.id,
	});
	await expectProductNotPresent({
		customer,
		productId: premium.id,
	});

	// Features updated to growth tier
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 2000,
		balance: 2000,
		usage: 0,
	});

	// Verify subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
