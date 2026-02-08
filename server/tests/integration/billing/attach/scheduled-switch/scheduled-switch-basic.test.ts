/**
 * Scheduled Switch Basic Tests (Attach V2)
 *
 * Tests for basic downgrade scenarios where a lower-tier product takes effect at end of billing cycle.
 *
 * Key behaviors:
 * - Downgrade schedules new product for end of cycle
 * - Current product enters "canceling" state (active with canceled_at set)
 * - New product has "scheduled" status
 * - At cycle end: current product removed, scheduled product becomes active
 * - Scheduled downgrades can be replaced by other downgrades
 *
 * NOTE: Tests for "upgrade cancels scheduled downgrade" are in immediate-switch-basic.test.ts
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductCanceling,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Pro to Free (scheduled downgrade, then advance cycle)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro ($20/mo)
 * - Downgrade to free
 * - Advance test clock to next billing cycle
 *
 * Expected Result:
 * - Pro enters "canceling" state (active with canceled_at set)
 * - Free is "scheduled" (will become active at end of billing cycle)
 * - After advancing cycle: pro removed, free active
 * - Features updated to free tier limits
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-basic 1: pro to free")}`, async () => {
	const customerId = "sched-switch-pro-to-free";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
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
			s.products({ list: [free, pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Verify Stripe subscription after initial attach
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// 1. Preview downgrade - no charge (downgrade is scheduled)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: free.id,
	});
	expect(preview.total).toBe(0);

	// 2. Attach free (downgrade)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: free.id,
		redirect_mode: "if_required",
	});

	const customerMidCycle =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify pro is canceling (active with canceled_at set)
	await expectProductCanceling({
		customer: customerMidCycle,
		productId: pro.id,
	});

	// Verify free is scheduled
	await expectProductScheduled({
		customer: customerMidCycle,
		productId: free.id,
	});

	// Pro's features still active until cycle end
	expectCustomerFeatureCorrect({
		customer: customerMidCycle,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	// Verify Stripe subscription after scheduling downgrade
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Only 1 invoice (initial pro attach)
	await expectCustomerInvoiceCorrect({
		customer: customerMidCycle,
		count: 1,
		latestTotal: 20,
	});

	// 3. Advance to next billing cycle
	const { autumnV1: autumnV1After } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.billing.attach({ productId: free.id }), // Schedule downgrade
			s.advanceToNextInvoice(), // Advance to cycle end
		],
	});

	const customerAfterCycle =
		await autumnV1After.customers.get<ApiCustomerV3>(customerId);

	// Verify product states after cycle
	await expectCustomerProducts({
		customer: customerAfterCycle,
		active: [free.id],
		notPresent: [pro.id],
	});

	// Verify features updated to free tier
	expectCustomerFeatureCorrect({
		customer: customerAfterCycle,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Invoice count: initial pro ($20) + renewal ($0 for free)
	// Note: After downgrade completes, only pro invoice exists since free has no charge
	await expectCustomerInvoiceCorrect({
		customer: customerAfterCycle,
		count: 1,
		latestTotal: 20,
	});

	// After downgrading to free, there should be no Stripe subscription
	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Premium to Pro (scheduled downgrade)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has premium ($50/mo)
 * - Downgrade to pro ($20/mo)
 *
 * Expected Result:
 * - Premium is canceling, pro is scheduled
 * - After cycle: premium removed, pro active
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-basic 2: premium to pro")}`, async () => {
	const customerId = "sched-switch-premium-to-pro";

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
		actions: [s.billing.attach({ productId: premium.id })],
	});

	// Preview downgrade - no immediate charge, next cycle is pro price
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
	});
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		total: 20,
		startsAt: addMonths(advancedTo, 1).getTime(),
	}); // Pro is $20/mo

	// Schedule downgrade to pro
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	// Verify mid-cycle state
	const customerMidCycle =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerMidCycle,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: customerMidCycle,
		productId: pro.id,
	});

	// Advance to next cycle
	const { autumnV1: autumnV1After } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({ productId: premium.id }),
			s.billing.attach({ productId: pro.id }),
			s.advanceToNextInvoice(),
		],
	});

	// Verify Stripe subscription is correct after all operations
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	const customer = await autumnV1After.customers.get<ApiCustomerV3>(customerId);

	// After cycle: premium removed, pro active
	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [premium.id],
	});

	// Features updated to pro tier
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	// Invoices: premium ($50) + pro renewal ($20)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 20,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Premium to Pro (scheduled) to Free (replaces scheduled)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has premium ($50/mo)
 * - Downgrade to pro (scheduled)
 * - Downgrade to free (replaces scheduled pro)
 *
 * Expected Result:
 * - Scheduled pro is replaced by free
 * - After cycle: premium removed, free active
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-basic 3: premium to pro to free")}`, async () => {
	const customerId = "sched-switch-premium-pro-free";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
	});

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
			s.products({ list: [free, pro, premium] }),
		],
		actions: [
			s.billing.attach({ productId: premium.id }),
			s.billing.attach({ productId: pro.id }), // Schedule downgrade to pro
		],
	});

	// Verify Stripe subscription after premium attach and pro scheduled
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Verify pro is scheduled
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerBefore,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: customerBefore,
		productId: pro.id,
	});

	// Preview downgrade to free - should be $0 (scheduled, not immediate)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: free.id,
	});
	expect(preview.total).toBe(0);

	// Downgrade to free (should replace scheduled pro)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: free.id,
		redirect_mode: "if_required",
	});

	const customerAfterReplace =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Premium still canceling
	await expectProductCanceling({
		customer: customerAfterReplace,
		productId: premium.id,
	});

	// Pro replaced by free (pro should be removed, free scheduled)
	await expectProductNotPresent({
		customer: customerAfterReplace,
		productId: pro.id,
	});
	await expectProductScheduled({
		customer: customerAfterReplace,
		productId: free.id,
	});

	// Verify Stripe subscription after replacing scheduled product
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Advance to next cycle to verify downgrade completes correctly
	const { autumnV1: autumnV1After, ctx: ctxAfter } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro, premium] }),
		],
		actions: [
			s.billing.attach({ productId: premium.id }),
			s.billing.attach({ productId: pro.id }), // Schedule downgrade to pro
			s.billing.attach({ productId: free.id }), // Replace with free
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	const customerAfterCycle =
		await autumnV1After.customers.get<ApiCustomerV3>(customerId);

	// After cycle: premium removed, free active
	await expectCustomerProducts({
		customer: customerAfterCycle,
		active: [free.id],
		notPresent: [premium.id, pro.id],
	});

	// Features updated to free tier
	expectCustomerFeatureCorrect({
		customer: customerAfterCycle,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Invoice: only premium ($50), free has no renewal charge
	await expectCustomerInvoiceCorrect({
		customer: customerAfterCycle,
		count: 1,
		latestTotal: 50,
	});

	// After downgrading to free, there should be no Stripe subscription
	await expectNoStripeSubscription({
		db: ctxAfter.db,
		customerId,
		org: ctxAfter.org,
		env: ctxAfter.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Premium to Free (scheduled) to Pro (upgrade cancels scheduled)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has premium ($50/mo)
 * - Downgrade to free (scheduled)
 * - Upgrade to pro ($20/mo) - immediate, should cancel scheduled downgrade
 *
 * Expected Result:
 * - Scheduled free is cancelled
 * - Pro is active immediately (downgrade from premium)
 * - Premium removed
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-basic 4: premium to free to pro")}`, async () => {
	const customerId = "sched-switch-premium-free-pro";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
	});

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
			s.products({ list: [free, pro, premium] }),
		],
		actions: [
			s.billing.attach({ productId: premium.id }),
			s.billing.attach({ productId: free.id }), // Schedule downgrade to free
		],
	});

	// Verify Stripe subscription after premium attach and free scheduled
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Verify state before upgrade
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerBefore,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: customerBefore,
		productId: free.id,
	});

	// Upgrade to pro - this should:
	// 1. Cancel the scheduled free downgrade
	// 2. Switch from premium to pro (still a downgrade since pro < premium)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
	});
	// Downgrade from premium ($50) to pro ($20) - scheduled, no charge
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		total: 20,
		startsAt: addMonths(advancedTo, 1).getTime(),
	}); // Pro is $20/mo next cycle

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Premium still canceling, pro scheduled (replacing free)
	await expectProductCanceling({
		customer,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer,
		productId: pro.id,
	});
	await expectProductNotPresent({
		customer,
		productId: free.id,
	});

	// Verify Stripe subscription after replacing scheduled product
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Advance to next cycle to verify downgrade completes correctly
	const { autumnV1: autumnV1After, ctx: ctxAfter } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro, premium] }),
		],
		actions: [
			s.billing.attach({ productId: premium.id }),
			s.billing.attach({ productId: free.id }), // Schedule downgrade to free
			s.billing.attach({ productId: pro.id }), // Replace with pro
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	const customerAfterCycle =
		await autumnV1After.customers.get<ApiCustomerV3>(customerId);

	// After cycle: premium removed, pro active
	await expectCustomerProducts({
		customer: customerAfterCycle,
		active: [pro.id],
		notPresent: [premium.id, free.id],
	});

	// Features updated to pro tier
	expectCustomerFeatureCorrect({
		customer: customerAfterCycle,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	// Invoices: premium ($50) + pro renewal ($20)
	await expectCustomerInvoiceCorrect({
		customer: customerAfterCycle,
		count: 2,
		latestTotal: 20,
		latestInvoiceProductIds: [pro.id],
	});

	// Verify Stripe subscription after cycle
	await expectSubToBeCorrect({
		db: ctxAfter.db,
		customerId,
		org: ctxAfter.org,
		env: ctxAfter.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Premium to Pro with reset_usage_when_enabled: false
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Premium ($50/mo) with 1000 messages, reset_usage_when_enabled: false
 * - Track 300 messages
 * - Downgrade to Pro ($20/mo) with 500 messages, reset_usage_when_enabled: false
 * - Advance to next cycle
 *
 * Expected Result:
 * - Pro active with messages usage RESET to 0
 * - Balance = 500 (reset_usage_when_enabled only affects IMMEDIATE switches, not scheduled)
 * - Scheduled product switches ALWAYS reset usage regardless of reset_usage_when_enabled setting
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-basic 5: premium to pro with reset_usage_when_enabled: false (usage resets)")}`, async () => {
	const customerId = "sched-switch-reset-usage-false-premium-to-pro";

	const premiumMessagesItem = items.monthlyMessages({
		includedUsage: 1000,
		resetUsageWhenEnabled: false,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const proMessagesItem = items.monthlyMessages({
		includedUsage: 500,
		resetUsageWhenEnabled: false,
	});
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			s.billing.attach({ productId: premium.id, timeout: 2000 }),
			s.track({ featureId: TestFeature.Messages, value: 300, timeout: 2000 }),
		],
	});

	// Verify usage tracked on premium
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		includedUsage: 1000,
		balance: 700, // 1000 - 300
		usage: 300,
	});

	// Schedule downgrade to pro
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	// Verify scheduled states
	const customerMidCycle =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerMidCycle,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: customerMidCycle,
		productId: pro.id,
	});

	// Usage still shows on canceling product
	expectCustomerFeatureCorrect({
		customer: customerMidCycle,
		featureId: TestFeature.Messages,
		includedUsage: 1000,
		balance: 700,
		usage: 300,
	});

	// Advance to next cycle with fresh scenario
	const { autumnV1: autumnV1After, ctx: ctxAfter } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			s.billing.attach({ productId: premium.id }),
			s.track({ featureId: TestFeature.Messages, value: 300, timeout: 2000 }),
			s.billing.attach({ productId: pro.id }), // Schedule downgrade
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	const customerAfterCycle =
		await autumnV1After.customers.get<ApiCustomerV3>(customerId);

	// Verify products after cycle
	await expectCustomerProducts({
		customer: customerAfterCycle,
		active: [pro.id],
		notPresent: [premium.id],
	});

	// Verify usage RESET (scheduled switches always reset, regardless of reset_usage_when_enabled)
	expectCustomerFeatureCorrect({
		customer: customerAfterCycle,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500, // RESET - not 500 - 300 = 200
		usage: 0, // RESET
	});

	// Verify Stripe subscription
	await expectSubToBeCorrect({
		db: ctxAfter.db,
		customerId,
		org: ctxAfter.org,
		env: ctxAfter.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Pro to Free with reset_usage_when_enabled: false
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro ($20/mo) with 500 messages, reset_usage_when_enabled: false
 * - Track 200 messages
 * - Downgrade to Free with 100 messages, reset_usage_when_enabled: false
 * - Advance to next cycle
 *
 * Expected Result:
 * - Free active with messages usage RESET to 0
 * - Balance = 100 (scheduled switches always reset usage)
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-basic 6: pro to free with reset_usage_when_enabled: false (usage resets)")}`, async () => {
	const customerId = "sched-switch-reset-usage-false-pro-to-free";

	const proMessagesItem = items.monthlyMessages({
		includedUsage: 500,
		resetUsageWhenEnabled: false,
	});
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const freeMessagesItem = items.monthlyMessages({
		includedUsage: 100,
		resetUsageWhenEnabled: false,
	});
	const free = products.base({
		id: "free",
		items: [freeMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id, timeout: 2000 }),
			s.track({ featureId: TestFeature.Messages, value: 200, timeout: 2000 }),
		],
	});

	// Verify usage tracked on pro
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 300, // 500 - 200
		usage: 200,
	});

	// Schedule downgrade to free
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: free.id,
		redirect_mode: "if_required",
	});

	// Verify scheduled states
	const customerMidCycle =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerMidCycle,
		productId: pro.id,
	});
	await expectProductScheduled({
		customer: customerMidCycle,
		productId: free.id,
	});

	// Advance to next cycle with fresh scenario
	const { autumnV1: autumnV1After, ctx: ctxAfter } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 200, timeout: 2000 }),
			s.billing.attach({ productId: free.id }), // Schedule downgrade
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	const customerAfterCycle =
		await autumnV1After.customers.get<ApiCustomerV3>(customerId);

	// Verify products after cycle
	await expectCustomerProducts({
		customer: customerAfterCycle,
		active: [free.id],
		notPresent: [pro.id],
	});

	// Verify usage RESET (scheduled switches always reset)
	expectCustomerFeatureCorrect({
		customer: customerAfterCycle,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100, // RESET
		usage: 0, // RESET
	});

	// After downgrading to free, there should be no Stripe subscription
	await expectNoStripeSubscription({
		db: ctxAfter.db,
		customerId,
		org: ctxAfter.org,
		env: ctxAfter.env,
	});
});
