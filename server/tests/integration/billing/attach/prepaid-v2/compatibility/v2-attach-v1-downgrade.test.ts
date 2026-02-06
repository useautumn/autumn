/**
 * V2 Attach → V1 Downgrade Compatibility Tests
 *
 * Tests that verify V1's attach() works correctly to DOWNGRADE a customer
 * who was initially attached via V2 billing. Downgrade scenarios include:
 * 1. Product downgrade (premium → pro with different prepaid configuration)
 * 2. Same product with decreased prepaid price
 *
 * V2 attach:
 * - Uses s.billing.attach()
 * - quantity = total units INCLUDING allowance
 *
 * V1 downgrade attach:
 * - Uses autumnV1.attach()
 * - quantity = packs * billingUnits (EXCLUDING allowance)
 *
 * Note: On product downgrade, usage resets and balance is recalculated.
 *
 * Test flow:
 * 1. Use s.billing.attach() for initial V2 attach
 * 2. Use autumnV1.attach() for V1 product downgrade
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
// TEST 1: PRODUCT DOWNGRADE (Premium → Pro) - Same quantity
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("v2→v1 downgrade: product downgrade (premium → pro) same quantity")}`, async () => {
	const customerId = "v2-v1-downgrade-product";
	const billingUnits = 100;

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

	// Pro: $10/pack, $20 base, 100 included usage
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

	// Initial: 700 total units on Premium (including 200 allowance)
	// = 500 prepaid units = 5 packs
	const initialTotalUnits = 700;
	const initialPacks =
		(initialTotalUnits - premiumIncludedUsage) / billingUnits; // 5

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			// V2 attach to Premium
			s.billing.attach({
				productId: premium.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialTotalUnits },
				],
				timeout: 4000,
			}),
		],
	});

	// Verify initial state on Premium
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		includedUsage: initialTotalUnits,
		balance: initialTotalUnits,
		usage: 0,
	});

	// Track some usage on Premium
	const messagesUsed = 200;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsed,
		},
		{ timeout: 2000 },
	);

	// Downgrade to Pro with same number of packs
	// Pro: 100 allowance + 5 packs = 100 + 500 = 600 total
	const proTotalUnits = proIncludedUsage + initialPacks * billingUnits;

	// V1 attach to Pro (quantity excluding allowance)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: initialPacks * billingUnits, // 500 (excluding allowance)
			},
		],
	});

	// Verify customer downgraded to Pro
	// On product change, usage resets and balance is recalculated
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
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

	// Verify invoice: should have downgrade credits
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: PRODUCT DOWNGRADE (Premium → Pro) - Decreased quantity
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("v2→v1 downgrade: product downgrade with decreased quantity")}`, async () => {
	const customerId = "v2-v1-downgrade-product-qty";
	const billingUnits = 100;

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

	// Pro: $10/pack, $20 base, 100 included usage
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

	// Initial: 800 total units on Premium (including 200 allowance)
	// = 600 prepaid units = 6 packs
	const initialTotalUnits = 800;

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			// V2 attach to Premium
			s.billing.attach({
				productId: premium.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialTotalUnits },
				],
			}),
		],
	});

	// Verify initial state on Premium
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		includedUsage: initialTotalUnits,
		balance: initialTotalUnits,
		usage: 0,
	});

	// Downgrade to Pro with FEWER packs
	// Pro: 100 allowance + 2 packs = 100 + 200 = 300 total
	const downgradePacks = 2;
	const proTotalUnits = proIncludedUsage + downgradePacks * billingUnits;

	// V1 attach to Pro (quantity excluding allowance)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: downgradePacks * billingUnits, // 200 (excluding allowance)
			},
		],
	});

	// Verify customer downgraded to Pro
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
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
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: SAME PRODUCT - Prepaid price decrease (custom plan update via V1)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("v2→v1 downgrade: same product with price decrease")}`, async () => {
	const customerId = "v2-v1-downgrade-price-decr";
	const billingUnits = 100;
	const includedUsage = 100;
	const initialPricePerPack = 15;

	const prepaidItem = items.prepaidMessages({
		includedUsage,
		billingUnits,
		price: initialPricePerPack,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});

	const priceItem = items.monthlyPrice({ price: 30 });
	const pro = products.base({
		id: "pro",
		items: [prepaidItem, priceItem],
	});

	// Initial: 500 total units (including 100 allowance)
	// = 400 prepaid units = 4 packs @ $15 = $60 prepaid
	const initialTotalUnits = 500;
	const initialPacks = (initialTotalUnits - includedUsage) / billingUnits; // 4

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			// V2 attach
			s.billing.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialTotalUnits },
				],
			}),
		],
	});

	// Verify initial state
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		includedUsage: initialTotalUnits,
		balance: initialTotalUnits,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerBefore,
		count: 1,
		latestTotal: (priceItem.price ?? 0) + initialPacks * initialPricePerPack,
	});

	// Create a new product version with lower prepaid price
	const downgradedPricePerPack = 8;
	const downgradedPrepaidItem = items.prepaidMessages({
		includedUsage,
		billingUnits,
		price: downgradedPricePerPack,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});
	const proDowngraded = products.base({
		id: "pro-downgraded",
		items: [downgradedPrepaidItem, priceItem],
	});

	// Initialize the downgraded product
	await initScenario({
		customerId: `${customerId}-setup`,
		setup: [s.products({ list: [proDowngraded] })],
		actions: [],
	});

	// V1 attach to downgraded product with same quantity
	await autumnV1.attach({
		customer_id: customerId,
		product_id: proDowngraded.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: initialPacks * billingUnits, // 400 (excluding allowance)
			},
		],
	});

	// Verify customer on downgraded product
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: initialTotalUnits,
		balance: initialTotalUnits,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Verify downgrade invoice (should have credit)
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: PRODUCT DOWNGRADE - Single billing unit (Users)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("v2→v1 downgrade: single billing unit (users)")}`, async () => {
	const customerId = "v2-v1-downgrade-users";
	const billingUnits = 1;

	// Pro: $8/user, $30 base, 10 free users
	const proIncludedUsage = 10;
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

	// Basic: $5/user, $10 base, 5 free users
	const basicIncludedUsage = 5;
	const basicPricePerUnit = 5;
	const basicPrepaidItem = items.prepaid({
		featureId: TestFeature.Users,
		includedUsage: basicIncludedUsage,
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

	// Initial: 25 total users on Pro (10 free + 15 paid)
	const initialTotalUnits = 25;
	const initialPaidUnits = initialTotalUnits - proIncludedUsage; // 15

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, basic] }),
		],
		actions: [
			// V2 attach to Pro
			s.billing.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Users, quantity: initialTotalUnits },
				],
			}),
		],
	});

	// Verify initial state on Pro
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Users,
		includedUsage: initialTotalUnits,
		balance: initialTotalUnits,
		usage: 0,
	});

	// Downgrade to Basic with fewer paid units
	// Basic: 5 free + 8 paid = 13 total
	const downgradePaidUnits = 8;
	const basicTotalUnits = basicIncludedUsage + downgradePaidUnits;

	// V1 attach to Basic (quantity excluding allowance)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: basic.id,
		options: [
			{
				feature_id: TestFeature.Users,
				quantity: downgradePaidUnits, // 8 (excluding allowance)
			},
		],
	});

	// Verify customer downgraded to Basic
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Users,
		includedUsage: basicTotalUnits,
		balance: basicTotalUnits,
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
