/**
 * V2 Attach → V1 Upgrade Compatibility Tests
 *
 * Tests that verify V1's attach() works correctly to UPGRADE a customer
 * who was initially attached via V2 billing. Upgrade scenarios include:
 * 1. Product upgrade (pro → premium with different prepaid configuration)
 * 2. Same product with increased prepaid price
 *
 * V2 attach:
 * - Uses s.billing.attach()
 * - quantity = total units INCLUDING allowance
 *
 * V1 upgrade attach:
 * - Uses autumnV1.attach()
 * - quantity = packs * billingUnits (EXCLUDING allowance)
 *
 * Test flow:
 * 1. Use s.billing.attach() for initial V2 attach
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
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: PRODUCT UPGRADE (Pro → Premium) - Same quantity
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("v2→v1 upgrade: product upgrade (pro → premium) same quantity")}`, async () => {
	const customerId = "v2-v1-upgrade-product";
	const billingUnits = 100;
	const includedUsage = 100;

	// Pro: $10/pack, $20 base
	const proPricePerPack = 10;
	const proPrepaidItem = items.prepaidMessages({
		includedUsage,
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

	// Premium: $15/pack, $50 base, 200 included usage
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

	// Initial: 500 total units on Pro (including 100 allowance)
	// = 400 prepaid units = 4 packs
	const initialTotalUnits = 500;
	const initialPacks = (initialTotalUnits - includedUsage) / billingUnits; // 4

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			// V2 attach to Pro
			s.billing.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialTotalUnits },
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
		includedUsage: initialTotalUnits,
		balance: initialTotalUnits,
		usage: 0,
	});

	// Upgrade to Premium with same number of packs
	// Premium: 200 allowance + 4 packs = 200 + 400 = 600 total
	const premiumTotalUnits = premiumIncludedUsage + initialPacks * billingUnits;

	// V1 attach to Premium (quantity excluding allowance)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: initialPacks * billingUnits, // 400 (excluding allowance)
			},
		],
	});

	// Verify customer upgraded to Premium
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: premiumTotalUnits,
		balance: premiumTotalUnits,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Verify invoice: should have upgrade charges
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal:
			initialPacks * (premiumPricePerPack - proPricePerPack) +
			(premiumPriceItem.price ?? 0) -
			(proPriceItem.price ?? 0),
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: PRODUCT UPGRADE (Pro → Premium) - Increased quantity
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("v2→v1 upgrade: product upgrade with increased quantity")}`, async () => {
	const customerId = "v2-v1-upgrade-product-qty";
	const billingUnits = 100;
	const includedUsage = 100;

	// Pro: $10/pack, $20 base
	const proPricePerPack = 10;
	const proPrepaidItem = items.prepaidMessages({
		includedUsage,
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

	// Premium: $15/pack, $50 base, 200 included usage
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

	// Initial: 300 total units on Pro (including 100 allowance)
	// = 200 prepaid units = 2 packs
	const initialTotalUnits = 300;

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			// V2 attach to Pro
			s.billing.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialTotalUnits },
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
		includedUsage: initialTotalUnits,
		balance: initialTotalUnits,
		usage: 0,
	});

	// Upgrade to Premium with MORE packs
	// Premium: 200 allowance + 5 packs = 200 + 500 = 700 total
	const upgradePacks = 5;
	const premiumTotalUnits = premiumIncludedUsage + upgradePacks * billingUnits;

	// V1 attach to Premium (quantity excluding allowance)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: upgradePacks * billingUnits, // 500 (excluding allowance)
			},
		],
	});

	// Verify customer upgraded to Premium
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: premiumTotalUnits,
		balance: premiumTotalUnits,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: PRODUCT UPGRADE - Single billing unit (Users)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("v2→v1 upgrade: single billing unit (users)")}`, async () => {
	const customerId = "v2-v1-upgrade-users";
	const billingUnits = 1;
	const includedUsage = 0; // 5 free users

	// Basic: $5/user, $10 base
	const basicPricePerUnit = 5;
	const basicPrepaidItem = items.prepaid({
		featureId: TestFeature.Users,
		includedUsage,
		billingUnits,
		price: basicPricePerUnit,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});
	const basicPriceItem = items.monthlyPrice({ price: 10 });
	const basic = products.base({
		id: "basic",
		items: [basicPrepaidItem, basicPriceItem],
	});

	// Pro: $8/user, $30 base, 10 free users
	const proIncludedUsage = 0;
	const proPricePerUnit = 8;
	const proPrepaidItem = items.prepaid({
		featureId: TestFeature.Users,
		includedUsage: proIncludedUsage,
		billingUnits,
		price: proPricePerUnit,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});
	const proPriceItem = items.monthlyPrice({ price: 30 });
	const pro = products.base({
		id: "pro",
		items: [proPrepaidItem, proPriceItem],
	});

	// Initial: 15 total users on Basic (5 free + 10 paid)
	const initialTotalUnits = 15;
	const initialPaidUnits = initialTotalUnits - includedUsage; // 10

	const { autumnV1, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [basic, pro] }),
		],
		actions: [
			// V2 attach to Basic
			s.billing.attach({
				productId: basic.id,
				options: [
					{ feature_id: TestFeature.Users, quantity: initialTotalUnits },
				],
			}),
		],
	});

	// Verify initial state on Basic
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Users,
		includedUsage: initialTotalUnits,
		balance: initialTotalUnits,
		usage: 0,
	});

	// Upgrade to Pro with same paid units
	// Pro: 10 free + 10 paid = 20 total
	const proTotalUnits = proIncludedUsage + initialPaidUnits;
	const pricePerPack = proPricePerUnit * billingUnits;

	// V1 attach to Pro (quantity excluding allowance)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{
				feature_id: TestFeature.Users,
				quantity: initialPaidUnits, // 10 (excluding allowance)
			},
		],
	});

	// Verify customer upgraded to Pro
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Users,
		includedUsage: proTotalUnits,
		balance: proTotalUnits,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal:
			(proPriceItem.price ?? 0) -
			(basicPriceItem.price ?? 0) +
			(proPricePerUnit - basicPricePerUnit) * initialPaidUnits,
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 3,
		latestTotal: initialPaidUnits * proPricePerUnit + (proPriceItem.price ?? 0),
	});
});
