/**
 * Immediate Switch Add-on Tests (Attach V2)
 *
 * Tests for add-on behavior during immediate upgrades.
 * Add-ons should remain intact when the main product upgrades.
 *
 * Key behaviors:
 * - Add-ons persist through main product upgrades
 * - Add-on features remain available after upgrade
 * - Subscription items for add-on remain on subscription
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Pro + add-on → Premium (add-on persists)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on Pro ($20/mo) with recurring add-on ($20/mo)
 * - Upgrade to Premium ($50/mo)
 *
 * Expected:
 * - Premium replaces Pro
 * - Add-on remains active
 * - Prorated charge for main product upgrade only
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-addon 1: pro+addon to premium")}`, async () => {
	const customerId = "imm-switch-addon-pro-to-premium";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

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
			s.products({ list: [pro, premium, recurringAddon] }),
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

	// Preview upgrade to Premium - $50 - $20 = $30 (prorated for main only)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});
	expect(preview.total).toBe(30);

	// Upgrade to Premium
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Premium active, Pro removed, add-on persists
	await expectCustomerProducts({
		customer,
		active: [premium.id, recurringAddon.id],
		notPresent: [pro.id],
	});

	// Messages from Premium (500, not Pro's 100)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	// Words from add-on (still available)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	// 3 invoices: Pro ($20) + add-on ($20) + upgrade ($30)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		latestTotal: 30,
	});

	// Verify subscription has Premium + add-on items
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Free + add-on → Pro (add-on persists)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on Free with recurring add-on ($20/mo)
 * - Upgrade to Pro ($20/mo)
 *
 * Expected:
 * - Pro replaces Free
 * - Add-on remains active
 * - Charged for Pro only (add-on already paid)
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-addon 2: free+addon to pro")}`, async () => {
	const customerId = "imm-switch-addon-free-to-pro";

	const freeMessagesItem = items.monthlyMessages({ includedUsage: 50 });
	const free = products.base({ id: "free", items: [freeMessagesItem] });

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
			s.products({ list: [free, pro, recurringAddon] }),
		],
		actions: [
			s.billing.attach({ productId: free.id }),
			s.billing.attach({ productId: recurringAddon.id }),
		],
	});

	// Verify initial state: Free + add-on
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerBefore,
		active: [free.id, recurringAddon.id],
	});

	// Preview upgrade to Pro - $20 (full price, no proration from free)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
	});
	expect(preview.total).toBe(20);

	// Upgrade to Pro
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Pro active, Free removed, add-on persists
	await expectCustomerProducts({
		customer,
		active: [pro.id, recurringAddon.id],
		notPresent: [free.id],
	});

	// Messages from Pro (200, not Free's 50)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	// Words from add-on (still available)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	// 2 invoices: add-on ($20) + Pro upgrade ($20)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 20,
	});

	// Verify subscription has Pro + add-on items
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Attach add-on while upgrade is happening (Pro → Premium + add-on)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on Pro ($20/mo)
 * - In same operation flow: upgrade to Premium AND attach add-on
 *
 * Expected:
 * - Premium replaces Pro
 * - Add-on attached
 * - Both charged appropriately
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-addon 3: pro to premium with addon")}`, async () => {
	const customerId = "imm-switch-addon-upgrade-with-addon";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

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
			s.products({ list: [pro, premium, recurringAddon] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Verify initial state: Pro only
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerBefore,
		active: [pro.id],
	});

	// Upgrade to Premium
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	// Attach add-on
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: recurringAddon.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Premium and add-on active, Pro removed
	await expectCustomerProducts({
		customer,
		active: [premium.id, recurringAddon.id],
		notPresent: [pro.id],
	});

	// Messages from Premium
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	// Words from add-on
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	// 3 invoices: Pro ($20) + Premium upgrade ($30) + add-on ($20)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		latestTotal: 20,
	});

	// Verify subscription has Premium + add-on items
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
