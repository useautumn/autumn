/**
 * Legacy Upgrade Tests - Prepaid Billing
 *
 * Migrated from:
 * - server/tests/attach/upgrade/upgrade4.test.ts (Prepaid seats: Pro → Premium → Pro Annual)
 * - server/tests/attach/upgrade/upgrade5.test.ts (Prepaid messages: Pro → Premium)
 *
 * Tests V1 attach behavior for product upgrades with prepaid billing:
 * - Prepaid seats (continuous use) with quantity options
 * - Prepaid messages (single use) with quantity options
 * - V1 quantity semantics (excludes allowance/includedUsage)
 * - Prepaid quantity inheritance on upgrade without options
 */

import { test } from "bun:test";
import { type ApiCustomerV3, OnDecrease, OnIncrease } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Prepaid seats (continuous use) - Pro → Premium → Pro Annual
// (from upgrade4)
//
// Scenario:
// - Pro ($20/month) with prepaid Users ($10/user, billingUnits: 1)
// - Premium ($50/month) with prepaid Users ($10/user, billingUnits: 1)
// - Pro annual ($200/year) with prepaid Users ($10/user, billingUnits: 1)
// - Attach Pro with 4 users (4 × $10 = $40)
// - Upgrade to Premium with 6 users (6 × $10 = $60)
// - Upgrade to Pro Annual with 3 users (3 × $10 = $30)
//
// Expected:
// - Customer has correct product and balance after each upgrade
// - Invoice totals include base price + prepaid seat charges
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-upgrade-prepaid 1: prepaid seats Pro → Premium → Pro Annual")}`, async () => {
	const customerId = "legacy-upgrade-prepaid-1";

	// Prepaid users: $10/user (default), billingUnits: 1
	const proUsers = items.prepaidUsers({ includedUsage: 0, billingUnits: 1 });
	const premiumUsers = items.prepaidUsers({
		includedUsage: 0,
		billingUnits: 1,
	});
	const proAnnualUsers = items.prepaidUsers({
		includedUsage: 0,
		billingUnits: 1,
	});

	const pro = products.pro({ id: "pro", items: [proUsers] });
	const premium = products.premium({ id: "premium", items: [premiumUsers] });
	const proAnnual = products.proAnnual({
		id: "pro-annual",
		items: [proAnnualUsers],
	});

	// Setup: Create customer and products
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, premium, proAnnual] }),
		],
		actions: [],
	});

	// Attach Pro with 4 users
	// Invoice: Pro base ($20) + 4 users × $10 = $60
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Users, quantity: 4 }],
	});

	const customerInitial =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerInitial,
		active: [pro.id],
	});

	expectCustomerFeatureCorrect({
		customer: customerInitial,
		featureId: TestFeature.Users,
		includedUsage: 4,
		balance: 4, // 4 prepaid users
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerInitial,
		count: 1,
		latestTotal: 60, // Pro $20 + 4 × $10 = $60
	});

	// Upgrade to Premium with 6 users
	// New total: Premium base ($50) + 6 users × $10 = $110
	// Diff from previous: need to calculate based on proration
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Users, quantity: 6 }],
	});

	const customerAfterPremium =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterPremium,
		active: [premium.id],
	});

	expectCustomerFeatureCorrect({
		customer: customerAfterPremium,
		featureId: TestFeature.Users,
		includedUsage: 6,
		balance: 6, // 6 prepaid users
		usage: 0,
	});

	// Verify invoice count increased
	await expectCustomerInvoiceCorrect({
		customer: customerAfterPremium,
		count: 2,
	});

	// Upgrade to Pro Annual with 3 users
	// New total: Pro Annual base ($200) + 3 users × $10 = $230
	await autumnV1.attach({
		customer_id: customerId,
		product_id: proAnnual.id,
		options: [{ feature_id: TestFeature.Users, quantity: 3 }],
	});

	const customerAfterProAnnual =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterProAnnual,
		active: [proAnnual.id],
	});

	expectCustomerFeatureCorrect({
		customer: customerAfterProAnnual,
		featureId: TestFeature.Users,
		includedUsage: 3,
		balance: 3, // 3 prepaid users
		usage: 0,
	});

	// Verify invoice count increased
	await expectCustomerInvoiceCorrect({
		customer: customerAfterProAnnual,
		count: 3,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Prepaid messages (single use) - Pro → Premium
// (from upgrade5)
//
// Scenario:
// - Pro ($20/month) with prepaid Messages ($10/100 units, billingUnits: 100)
// - Premium ($50/month) with prepaid Messages ($10/100 units, billingUnits: 100)
// - Attach Pro with 300 messages (3 packs × $10 = $30)
// - Track some usage
// - Upgrade to Premium with 600 messages (6 packs × $10 = $60)
//
// Expected:
// - Customer has correct product and balance after each upgrade
// - Invoice totals include base price + prepaid message packs
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-upgrade-prepaid 2: prepaid messages Pro → Premium")}`, async () => {
	const customerId = "legacy-upgrade-prepaid-2";

	// Prepaid messages: $10/100 units (default)
	const proMessages = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
	});
	const premiumMessages = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
	});

	const pro = products.pro({ id: "pro", items: [proMessages] });
	const premium = products.premium({ id: "premium", items: [premiumMessages] });

	// Setup: Create customer and products
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, premium] }),
		],
		actions: [],
	});

	// Attach Pro with 300 messages (3 packs)
	// Invoice: Pro base ($20) + 3 packs × $10 = $50
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
	});

	const customerInitial =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerInitial,
		active: [pro.id],
	});

	expectCustomerFeatureCorrect({
		customer: customerInitial,
		featureId: TestFeature.Messages,
		includedUsage: 300,
		balance: 300, // 300 prepaid messages
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerInitial,
		count: 1,
		latestTotal: 50, // Pro $20 + 3 × $10 = $50
	});

	// Track 100 messages usage
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	await new Promise((r) => setTimeout(r, 2000));

	// Verify state before upgrade
	const customerBeforeUpgrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer: customerBeforeUpgrade,
		featureId: TestFeature.Messages,
		includedUsage: 300,
		balance: 200, // 300 - 100 = 200
		usage: 100,
	});

	// Upgrade to Premium with 600 messages (6 packs)
	// New prepaid: 6 packs × $10 = $60
	// Old prepaid refund: 3 packs × $10 = $30
	// Base price diff: $50 - $20 = $30
	// Expected invoice: $30 (base diff) + $60 (new prepaid) - $30 (refund) = $60
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 600 }],
	});

	const customerAfterPremium =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterPremium,
		active: [premium.id],
	});

	// Balance should be new prepaid quantity (usage does not carry over for prepaid)
	expectCustomerFeatureCorrect({
		customer: customerAfterPremium,
		featureId: TestFeature.Messages,
		includedUsage: 600,
		balance: 600, // 600 new prepaid messages
		usage: 0,
	});

	// Verify invoice count increased
	await expectCustomerInvoiceCorrect({
		customer: customerAfterPremium,
		count: 2,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: UPGRADE (Pro → Premium) with explicit prepaid options
// V1 attach quantity does NOT include included usage
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-upgrade-prepaid 3: pro → premium with explicit options (quantity excludes allowance)")}`, async () => {
	const customerId = "legacy-upgrade-prepaid-3";
	const billingUnits = 100;

	// Pro: $10/pack, $20 base, 100 includedUsage
	const proIncludedUsage = 100;
	const proPricePerPack = 10;
	const proPrepaidItem = items.prepaidMessages({
		includedUsage: proIncludedUsage,
		billingUnits,
		price: proPricePerPack,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});
	const proPriceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [proPrepaidItem, proPriceItem],
	});

	// Premium: $15/pack, $50 base, 200 includedUsage
	const premiumIncludedUsage = 200;
	const premiumPricePerPack = 15;
	const premiumPrepaidItem = items.prepaidMessages({
		includedUsage: premiumIncludedUsage,
		billingUnits,
		price: premiumPricePerPack,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});
	const premiumPriceItem = items.monthlyPrice({ price: 50 });
	const premium = products.base({
		id: "premium",
		items: [premiumPrepaidItem, premiumPriceItem],
	});

	// V1 attach: initial quantity = 3 packs (300 units EXCLUDING allowance)
	// So total balance = 100 (allowance) + 300 (prepaid) = 400
	const initialPacks = 3;
	const initialQuantityV1 = initialPacks * billingUnits; // 300 - V1 quantity excludes allowance
	const initialTotalBalance = proIncludedUsage + initialQuantityV1; // 400

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			// V1 attach to Pro with 3 packs (quantity excludes allowance)
			s.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantityV1 },
				],
			}),
		],
	});

	// Verify initial state on Pro
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		includedUsage: initialTotalBalance, // 100 + 300 = 400
		balance: initialTotalBalance,
		usage: 0,
	});

	// Upgrade to Premium with 5 packs (500 units EXCLUDING allowance)
	// V1 quantity still excludes allowance
	const upgradePacks = 5;
	const upgradeQuantityV1 = upgradePacks * billingUnits; // 500 - V1 quantity excludes allowance
	const premiumTotalBalance = premiumIncludedUsage + upgradeQuantityV1; // 200 + 500 = 700

	// V1 attach to Premium
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: upgradeQuantityV1, // 500 (excluding allowance)
			},
		],
	});

	// Verify customer upgraded to Premium with correct total balance
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: premiumTotalBalance, // 200 + 500 = 700
		balance: premiumTotalBalance,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Verify invoice: 2 invoices (initial attach + upgrade)
	// Upgrade cost = (new base - old base) + (new packs * new price - old packs * old price)
	// = (50 - 20) + (5 * 15 - 3 * 10) = 30 + (75 - 30) = 30 + 45 = 75
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal:
			(premiumPriceItem.price ?? 0) -
			(proPriceItem.price ?? 0) +
			(upgradePacks * premiumPricePerPack - initialPacks * proPricePerPack),
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: UPGRADE (Pro → Premium) without options - prepaid quantity inherits
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-upgrade-prepaid 4: pro → premium without options (quantity inherits)")}`, async () => {
	const customerId = "legacy-upgrade-prepaid-4";
	const billingUnits = 100;

	// Pro: $10/pack, $20 base, 100 includedUsage
	const proIncludedUsage = 100;
	const proPricePerPack = 10;
	const proPrepaidItem = items.prepaidMessages({
		includedUsage: proIncludedUsage,
		billingUnits,
		price: proPricePerPack,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});
	const proPriceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [proPrepaidItem, proPriceItem],
	});

	// Premium: $15/pack, $50 base, 200 includedUsage
	const premiumIncludedUsage = 200;
	const premiumPricePerPack = 15;
	const premiumPrepaidItem = items.prepaidMessages({
		includedUsage: premiumIncludedUsage,
		billingUnits,
		price: premiumPricePerPack,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});
	const premiumPriceItem = items.monthlyPrice({ price: 50 });
	const premium = products.base({
		id: "premium",
		items: [premiumPrepaidItem, premiumPriceItem],
	});

	// V1 attach: initial quantity = 4 packs (400 units EXCLUDING allowance)
	// So total balance = 100 (allowance) + 400 (prepaid) = 500
	const initialPacks = 4;
	const initialQuantityV1 = initialPacks * billingUnits; // 400 - V1 quantity excludes allowance
	const initialTotalBalance = proIncludedUsage + initialQuantityV1; // 500

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			// V1 attach to Pro with 4 packs (quantity excludes allowance)
			s.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantityV1 },
				],
			}),
		],
	});

	// Verify initial state on Pro
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		includedUsage: initialTotalBalance, // 100 + 400 = 500
		balance: initialTotalBalance,
		usage: 0,
	});

	// Upgrade to Premium WITHOUT passing options
	// The prepaid quantity should inherit from Pro (4 packs)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		// NOTE: No options passed - should inherit from Pro
	});

	// When no options passed, the system should inherit the prepaid packs from Pro
	// Premium total balance = 200 (allowance) + 400 (inherited prepaid) = 600
	const premiumTotalBalance = premiumIncludedUsage + initialQuantityV1;

	// Verify customer upgraded to Premium with inherited prepaid quantity
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: premiumTotalBalance, // 200 + 400 = 600
		balance: premiumTotalBalance,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Verify invoice: 2 invoices (initial attach + upgrade)
	// Upgrade cost = (new base - old base) + (packs * (new price - old price))
	// = (50 - 20) + (4 * (15 - 10)) = 30 + 20 = 50
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal:
			(premiumPriceItem.price ?? 0) -
			(proPriceItem.price ?? 0) +
			initialPacks * (premiumPricePerPack - proPricePerPack),
	});
});
