/**
 * Scheduled Switch Add-on Tests (Attach V2)
 *
 * Tests for add-on behavior during scheduled downgrades.
 * Add-ons should remain intact when the main product downgrades.
 *
 * Key behaviors:
 * - Add-ons persist through main product downgrades
 * - Add-on features remain available after downgrade completes
 * - Add-on subscription items remain on subscription through cycle boundary
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Pro + add-on → Free (add-on persists after cycle)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on Pro ($20/mo) with recurring add-on ($20/mo)
 * - Downgrade to Free (scheduled for end of cycle)
 * - Advance to next cycle
 *
 * Expected:
 * - Pro canceling, Free scheduled
 * - Add-on remains active throughout
 * - After cycle: Free active, add-on still active
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-addon 1: pro+addon to free")}`, async () => {
	const customerId = "sched-switch-addon-pro-to-free";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 200 });
	const pro = products.pro({ id: "pro", items: [proMessagesItem] });

	const freeMessagesItem = items.monthlyMessages({ includedUsage: 50 });
	const free = products.base({ id: "free", items: [freeMessagesItem] });

	const wordsItem = items.monthlyWords({ includedUsage: 200 });
	const recurringAddon = products.recurringAddOn({
		id: "recurring-addon",
		items: [wordsItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free, recurringAddon] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.billing.attach({ productId: recurringAddon.id }),
		],
	});

	// Verify initial state: Pro + add-on
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerBefore,
		active: [pro.id, recurringAddon.id],
	});

	// Schedule downgrade to Free - no charge
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: free.id,
	});
	expect(preview.total).toBe(0);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: free.id,
		redirect_mode: "if_required",
	});

	// Verify mid-cycle state
	const customerMidCycle =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Pro canceling, Free scheduled, add-on still active
	await expectCustomerProducts({
		customer: customerMidCycle,
		canceling: [pro.id],
		active: [recurringAddon.id],
		scheduled: [free.id],
	});

	// Pro features still available during cycle
	expectCustomerFeatureCorrect({
		customer: customerMidCycle,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	// Add-on features available
	expectCustomerFeatureCorrect({
		customer: customerMidCycle,
		featureId: TestFeature.Words,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	// Verify subscription with scheduled downgrade
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Advance to next cycle
	const { autumnV1: autumnV1After, ctx: ctxAfter } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free, recurringAddon] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.billing.attach({ productId: recurringAddon.id }),
			s.billing.attach({ productId: free.id }), // Schedule downgrade
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	const customerAfterCycle =
		await autumnV1After.customers.get<ApiCustomerV3>(customerId);

	// After cycle: Free active, Pro removed, ADD-ON STILL ACTIVE
	await expectCustomerProducts({
		customer: customerAfterCycle,
		active: [free.id, recurringAddon.id],
		notPresent: [pro.id],
	});

	// Messages from Free (50, not Pro's 200)
	expectCustomerFeatureCorrect({
		customer: customerAfterCycle,
		featureId: TestFeature.Messages,
		includedUsage: 50,
		balance: 50,
		usage: 0,
	});

	// Words from add-on STILL AVAILABLE
	expectCustomerFeatureCorrect({
		customer: customerAfterCycle,
		featureId: TestFeature.Words,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	// Verify subscription still has add-on
	await expectSubToBeCorrect({
		db: ctxAfter.db,
		customerId,
		org: ctxAfter.org,
		env: ctxAfter.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Premium + add-on → Pro (add-on persists after cycle)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on Premium ($50/mo) with recurring add-on ($20/mo)
 * - Downgrade to Pro ($20/mo) (scheduled)
 * - Advance to next cycle
 *
 * Expected:
 * - After cycle: Pro active, add-on still active
 * - Renewal: Pro ($20) + add-on ($20) = $40
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-addon 2: premium+addon to pro")}`, async () => {
	const customerId = "sched-switch-addon-premium-to-pro";

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const proMessagesItem = items.monthlyMessages({ includedUsage: 200 });
	const pro = products.pro({ id: "pro", items: [proMessagesItem] });

	const wordsItem = items.monthlyWords({ includedUsage: 200 });
	const recurringAddon = products.recurringAddOn({
		id: "recurring-addon",
		items: [wordsItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro, recurringAddon] }),
		],
		actions: [
			s.billing.attach({ productId: premium.id }),
			s.billing.attach({ productId: recurringAddon.id }),
		],
	});

	// Verify initial state: Premium + add-on
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerBefore,
		active: [premium.id, recurringAddon.id],
	});

	// Schedule downgrade to Pro
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	// Verify mid-cycle state
	const customerMidCycle =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerMidCycle,
		canceling: [premium.id],
		active: [recurringAddon.id],
		scheduled: [pro.id],
	});

	// Verify subscription with scheduled downgrade
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Advance to next cycle
	const { autumnV1: autumnV1After, ctx: ctxAfter } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro, recurringAddon] }),
		],
		actions: [
			s.billing.attach({ productId: premium.id }),
			s.billing.attach({ productId: recurringAddon.id }),
			s.billing.attach({ productId: pro.id }), // Schedule downgrade
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	const customerAfterCycle =
		await autumnV1After.customers.get<ApiCustomerV3>(customerId);

	// After cycle: Pro active, Premium removed, ADD-ON STILL ACTIVE
	await expectCustomerProducts({
		customer: customerAfterCycle,
		active: [pro.id, recurringAddon.id],
		notPresent: [premium.id],
	});

	// Messages from Pro (200)
	expectCustomerFeatureCorrect({
		customer: customerAfterCycle,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	// Words from add-on STILL AVAILABLE
	expectCustomerFeatureCorrect({
		customer: customerAfterCycle,
		featureId: TestFeature.Words,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	// Verify subscription still has Pro + add-on
	await expectSubToBeCorrect({
		db: ctxAfter.db,
		customerId,
		org: ctxAfter.org,
		env: ctxAfter.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Add-on persists through multiple switches
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on Pro ($20/mo) with recurring add-on ($20/mo)
 * - Downgrade to Free (scheduled)
 * - Upgrade to Premium (cancels scheduled downgrade)
 *
 * Expected:
 * - Add-on remains through all transitions
 * - Premium + add-on active at the end
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-addon 3: addon persists through multiple switches")}`, async () => {
	const customerId = "sched-switch-addon-multi-switch";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 200 });
	const pro = products.pro({ id: "pro", items: [proMessagesItem] });

	const freeMessagesItem = items.monthlyMessages({ includedUsage: 50 });
	const free = products.base({ id: "free", items: [freeMessagesItem] });

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const wordsItem = items.monthlyWords({ includedUsage: 200 });
	const recurringAddon = products.recurringAddOn({
		id: "recurring-addon",
		items: [wordsItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free, premium, recurringAddon] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.billing.attach({ productId: recurringAddon.id }),
		],
	});

	// Verify initial state: Pro + add-on
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerBefore,
		active: [pro.id, recurringAddon.id],
	});

	// Schedule downgrade to Free
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: free.id,
		redirect_mode: "if_required",
	});

	// Verify scheduled state: Pro canceling, Free scheduled, add-on active
	const customerAfterDowngrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterDowngrade,
		canceling: [pro.id],
		active: [recurringAddon.id],
		scheduled: [free.id],
	});

	// Upgrade to Premium (should cancel scheduled downgrade)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const customerAfterUpgrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Premium active, Pro and Free removed, ADD-ON STILL ACTIVE
	await expectCustomerProducts({
		customer: customerAfterUpgrade,
		active: [premium.id, recurringAddon.id],
		notPresent: [pro.id, free.id],
	});

	// Messages from Premium (500)
	expectCustomerFeatureCorrect({
		customer: customerAfterUpgrade,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	// Words from add-on STILL AVAILABLE through all transitions
	expectCustomerFeatureCorrect({
		customer: customerAfterUpgrade,
		featureId: TestFeature.Words,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	// Verify subscription has Premium + add-on
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
