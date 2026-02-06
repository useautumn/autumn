/**
 * Legacy Attach V1 Upgrade - Prepaid Compatibility Tests
 *
 * Tests that verify V1's attach() (s.attach) works correctly for upgrade scenarios
 * involving prepaid features.
 *
 * KEY DIFFERENCE between V1 and V2:
 * - V1 attach (s.attach): quantity = packs * billingUnits (EXCLUDING allowance/includedUsage)
 * - V2 attach (s.billing.attach): quantity = total units INCLUDING allowance/includedUsage
 *
 * Test flow:
 * 1. Use s.attach() for initial V1 attach with prepaid
 * 2. Use autumnV1.attach() for V1 product upgrade
 */

import { test } from "bun:test";
import { type ApiCustomerV3, OnDecrease, OnIncrease } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST A: UPGRADE (Pro → Premium) with explicit prepaid options
// V1 attach quantity does NOT include included usage
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("v1 upgrade: pro → premium with explicit prepaid options (quantity excludes allowance)")}`, async () => {
	const customerId = "v1-upgrade-prepaid-explicit";
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
// TEST B: UPGRADE (Pro → Premium) without options - prepaid quantity inherits
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("v1 upgrade: pro → premium without options (prepaid quantity inherits from pro)")}`, async () => {
	const customerId = "v1-upgrade-prepaid-inherit";
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
