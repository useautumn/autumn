/**
 * V1 Attach → V2 Update Quantity Compatibility Tests
 *
 * Tests that verify V2's subscriptions.update() works correctly to update quantity for
 * customers who were initially attached via V1 billing.
 *
 * V1 attach:
 * - Uses autumnV1.attach() or s.attach()
 * - quantity = packs * billingUnits (EXCLUDING allowance)
 *
 * V2 subscriptions.update:
 * - Uses autumnV1.subscriptions.update()
 * - quantity = total units INCLUDING allowance
 *
 * Test flow:
 * 1. Use s.attach() for initial V1 attach (quantity excluding allowance)
 * 2. Use autumnV1.subscriptions.update() for V2 quantity update (quantity including allowance)
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
// TEST 1: INCREMENT QUANTITY - MULTI BILLING UNITS (Messages)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("v1→v2 compat: increment quantity (multi billing units)")}`, async () => {
	const customerId = "v1-v2-compat-incr-multi";
	const billingUnits = 100;
	const pricePerPack = 10;
	const includedUsage = 100; // Allowance

	const prepaidItem = items.prepaidMessages({
		includedUsage,
		billingUnits,
		price: pricePerPack,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});

	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [prepaidItem, priceItem],
	});

	// Initial: 500 total units (including 100 allowance)
	// = 400 prepaid units = 4 packs
	// V1 attach quantity = 4 * 100 = 400 (excluding allowance)
	const initialTotalUnits = 500;
	const initialPacks = (initialTotalUnits - includedUsage) / billingUnits; // 4

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			// V1 attach with quantity EXCLUDING allowance
			s.attach({
				productId: pro.id,
				options: [
					{
						feature_id: TestFeature.Messages,
						quantity: initialPacks * billingUnits,
					},
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
		includedUsage: initialTotalUnits, // allowance + prepaid
		balance: initialTotalUnits,
		usage: 0,
	});

	// Upgrade: 500 → 800 total units (including 100 allowance)
	// = 700 prepaid units = 7 packs
	const updatedTotalUnits = 800;

	// V2 subscriptions.update with quantity INCLUDING allowance
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: updatedTotalUnits, // V2 expects total including allowance
			},
		],
	});

	// Verify customer feature balance updated correctly
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: updatedTotalUnits,
		balance: updatedTotalUnits,
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
		latestTotal: 3 * pricePerPack, // added 3 packs
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: DECREMENT QUANTITY - MULTI BILLING UNITS (Messages)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("v1→v2 compat: decrement quantity (multi billing units)")}`, async () => {
	const customerId = "v1-v2-compat-decr-multi";
	const billingUnits = 100;
	const pricePerPack = 10;
	const includedUsage = 100;

	const prepaidItem = items.prepaidMessages({
		includedUsage,
		billingUnits,
		price: pricePerPack,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});

	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [prepaidItem, priceItem],
	});

	// Start high: 800 total units = 7 packs
	// V1 attach quantity = 7 * 100 = 700 (excluding allowance)
	const initialTotalUnits = 800;
	const initialPacks = (initialTotalUnits - includedUsage) / billingUnits; // 7

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			// V1 attach with quantity EXCLUDING allowance
			s.attach({
				productId: pro.id,
				options: [
					{
						feature_id: TestFeature.Messages,
						quantity: initialPacks * billingUnits,
					},
				],
			}),
		],
	});

	// Track some usage first
	const messagesUsed = 150;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsed,
		},
		{ timeout: 2000 },
	);

	// Downgrade: 800 → 400 total units = 3 packs
	const downgradedTotalUnits = 400;

	// V2 subscriptions.update with quantity INCLUDING allowance
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: downgradedTotalUnits, // V2 expects total including allowance
			},
		],
	});

	// Verify customer feature balance
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: downgradedTotalUnits,
		balance: downgradedTotalUnits - messagesUsed,
		usage: messagesUsed,
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
		latestTotal: -4 * pricePerPack, // removed 4 packs
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: INCREMENT QUANTITY - SINGLE BILLING UNIT (Users)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("v1→v2 compat: increment quantity (single billing unit)")}`, async () => {
	const customerId = "v1-v2-compat-incr-single";
	const billingUnits = 1;
	const pricePerUnit = 5;
	const includedUsage = 5; // 5 free users

	const prepaidItem = items.prepaid({
		featureId: TestFeature.Users,
		includedUsage,
		billingUnits,
		price: pricePerUnit,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});

	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [prepaidItem, priceItem],
	});

	// Initial: 10 total users (5 free + 5 paid)
	// V1 attach quantity = 5 (excluding allowance)
	const initialTotalUnits = 10;
	const initialPaidUnits = initialTotalUnits - includedUsage; // 5

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			// V1 attach with quantity EXCLUDING allowance
			s.attach({
				productId: pro.id,
				options: [
					{
						feature_id: TestFeature.Users,
						quantity: initialPaidUnits,
					},
				],
			}),
		],
	});

	// Upgrade: 10 → 20 total users (5 free + 15 paid)
	const updatedTotalUnits = 20;

	// V2 subscriptions.update with quantity INCLUDING allowance
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{
				feature_id: TestFeature.Users,
				quantity: updatedTotalUnits, // V2 expects total including allowance
			},
		],
	});

	// Verify customer feature balance
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Users,
		includedUsage: updatedTotalUnits,
		balance: updatedTotalUnits,
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
		latestTotal: 10 * pricePerUnit, // added 10 paid units
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: DECREMENT WITH NO PRORATIONS
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("v1→v2 compat: decrement with no prorations")}`, async () => {
	const customerId = "v1-v2-compat-decr-no-prorate";
	const billingUnits = 100;
	const pricePerPack = 10;
	const includedUsage = 100;

	const prepaidItem = items.prepaidMessages({
		includedUsage,
		billingUnits,
		price: pricePerPack,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.None, // Key: no prorations on decrease
		},
	});

	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [prepaidItem, priceItem],
	});

	// Start: 600 total units = 5 packs
	// V1 attach quantity = 5 * 100 = 500 (excluding allowance)
	const initialTotalUnits = 600;
	const initialPacks = (initialTotalUnits - includedUsage) / billingUnits; // 5

	const { autumnV1, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			// V1 attach with quantity EXCLUDING allowance
			s.attach({
				productId: pro.id,
				options: [
					{
						feature_id: TestFeature.Messages,
						quantity: initialPacks * billingUnits,
					},
				],
			}),
		],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Get initial invoice count
	await expectCustomerInvoiceCorrect({
		customer: customerBefore,
		count: 1, // Initial attach invoice
		latestTotal: (priceItem.price ?? 0) + initialPacks * pricePerPack,
	});

	// Downgrade: 600 → 300 total units = 2 packs
	const downgradedTotalUnits = 300;
	const downgradedPacks = (downgradedTotalUnits - includedUsage) / billingUnits; // 2

	// V2 subscriptions.update with quantity INCLUDING allowance
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: downgradedTotalUnits, // V2 expects total including allowance
			},
		],
	});

	// With NoProrations, balance should NOT change immediately
	// The new quantity takes effect at next billing cycle
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Balance stays at initial (no immediate decrement)
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: initialTotalUnits, // Unchanged until renewal
		balance: initialTotalUnits,
		usage: 0,
	});

	// No new invoice should be created (no prorations)
	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 1, // Still just the initial invoice
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: downgradedPacks * pricePerPack + (priceItem.price ?? 0),
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
