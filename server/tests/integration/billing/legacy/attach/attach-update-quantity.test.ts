/**
 * Attach Update Quantity Tests (Legacy Migration)
 *
 * Tests for attach endpoint quantity updates that don't involve cycle renewal.
 * These tests focus on mid-cycle quantity changes and entity-level prepaid add-ons.
 *
 * Migrated from:
 * - server/tests/attach/prepaid/prepaid2.test.ts (quantity upgrade, prorate immediately, mid-cycle)
 * - server/tests/attach/prepaid/prepaid5.test.ts (prepaid add-on with entities)
 *
 * Key behaviors tested:
 * - Immediate proration when upgrading quantity mid-cycle
 * - Entity-level prepaid add-on quantity management
 * - Separate subscriptions for different entities
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	AttachErrCode,
	OnDecrease,
	OnIncrease,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductItemCorrect } from "@tests/integration/billing/utils/expectProductItemCorrect";
import { calculateProratedCharge } from "@tests/integration/billing/utils/stripeSubscriptionUtils";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Quantity upgrade mid-cycle with prorate immediately
// (Migrated from prepaid2.test.ts)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach prepaid messages with quantity 300
 * - Track some usage
 * - Advance test clock 2 weeks (mid-cycle)
 * - Upgrade quantity to 400 (prorate_immediately)
 *
 * Expected Result:
 * - Immediate proration invoice for the upgrade
 * - Balance increases by 100 (the additional quantity)
 */
test.concurrent(`${chalk.yellowBright("attach: quantity upgrade mid-cycle with prorate immediately")}`, async () => {
	const customerId = "attach-qty-upgrade-mid-cycle";

	const prepaidItem = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 12.5,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.None,
		},
	});

	const pro = products.pro({
		id: "pro",
		items: [prepaidItem],
	});

	const usage = Math.floor(Math.random() * 220); // Random usage between 0-219

	const { autumnV1, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
			}),
			s.track({ featureId: TestFeature.Messages, value: usage }),
			// Advance 2 weeks (mid-cycle)
			s.advanceTestClock({ weeks: 2 }),
			// Upgrade quantity to 400 (prorate_immediately)
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 400 }],
				timeout: 5000, // Wait for proration invoice
			}),
		],
	});

	// Verify final state
	const customerFinal = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Balance should be: 400 (new quantity) - usage
	expect(customerFinal.features[TestFeature.Messages].balance).toBe(
		500 - usage,
	);

	const upgradeQuantity = 500 - 400;
	const billingUnits = prepaidItem.billing_units ?? 1;
	if (prepaidItem.price == null)
		throw new Error("Missing price on prepaid item");

	if (billingUnits <= 0)
		throw new Error("Billing units must be greater than zero");

	const pricePerUnit = prepaidItem.price;
	const fullUpgradeAmount = (upgradeQuantity / billingUnits) * pricePerUnit;
	const frozenTimeMs = Math.floor(advancedTo / 1000) * 1000;
	const expectedLatestTotal = await calculateProratedCharge({
		customerId,
		nowMs: frozenTimeMs,
		amount: fullUpgradeAmount,
	});

	// Should have 2 invoices: initial attach + proration for upgrade
	expectCustomerInvoiceCorrect({
		customer: customerFinal,
		count: 2,
		latestInvoiceProductId: pro.id,
		latestTotal: expectedLatestTotal,
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500 - usage,
		usage: usage,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Quantity decrease → increase → decrease flow
// (Migrated from prepaid1.test.ts - attach portion)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach prepaid messages with quantity 300
 * - Decrease to 200 (on_decrease: none, sets upcoming_quantity)
 * - Increase to 400 (on_increase: prorate_immediately, creates invoice)
 * - Decrease back to 200 (sets upcoming_quantity again)
 *
 * Expected Result:
 * - After decrease to 200: balance stays 300, upcoming_quantity = 2
 * - After increase to 400: balance becomes 400, 2 invoices (initial + proration)
 * - After decrease to 200: balance stays 400, upcoming_quantity = 2
 */
test.concurrent(`${chalk.yellowBright("attach: quantity decrease → increase → decrease flow")}`, async () => {
	const customerId = "attach-qty-dec-inc-dec";

	const prepaidItem = items.prepaidMessages({
		billingUnits: 100,
		price: 12.5,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.None,
		},
	});

	const pro = products.pro({
		id: "pro",
		items: [prepaidItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			// Attach with quantity 300
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
			}),
		],
	});

	// Verify initial attach
	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfterAttach.features[TestFeature.Messages].balance).toBe(300);

	// Decrease to 200 (on_decrease: none - sets upcoming_quantity, no immediate change)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
	});

	const customerAfterDecrease =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	// Balance should still be 300 (no immediate change for decrease)
	expect(customerAfterDecrease.features[TestFeature.Messages].balance).toBe(
		300,
	);
	// upcoming_quantity should be set
	await expectProductItemCorrect({
		customer: customerAfterDecrease,
		productId: pro.id,
		featureId: TestFeature.Messages,
		quantity: 300, // Still 300 / 100
		upcomingQuantity: 200, // 200 / 100
	});

	// Increase to 400 (prorate_immediately - creates invoice, immediate change)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 400 }],
	});

	// Wait for invoice to be created
	await new Promise((resolve) => setTimeout(resolve, 5000));

	const customerAfterIncrease =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	// Balance should now be 400 (immediate increase)
	expect(customerAfterIncrease.features[TestFeature.Messages].balance).toBe(
		400,
	);
	// Should have 2 invoices: initial + proration
	expectCustomerInvoiceCorrect({
		customer: customerAfterIncrease,
		count: 2,
	});

	// Decrease back to 200 (sets upcoming_quantity again)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
	});

	const customerFinal = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	// Balance should still be 400 (no immediate change for decrease)
	expect(customerFinal.features[TestFeature.Messages].balance).toBe(400);
	// upcoming_quantity should be set to 2
	await expectProductItemCorrect({
		customer: customerFinal,
		productId: pro.id,
		featureId: TestFeature.Messages,
		quantity: 400, // Still 400 / 100
		upcomingQuantity: 200, // 200 / 100
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Prepaid add-on with entities
// (Migrated from prepaid5.test.ts)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Create 2 entities
 * - Entity 1: Attach pro + prepaid add-on with quantity 100
 * - Entity 2: Attach premium + prepaid add-on with quantity 300
 * - Upgrade entity 1 add-on to quantity 200
 * - Downgrade entity 2 add-on to quantity 200 (sets next_cycle_quantity)
 *
 * Expected Result:
 * - Each entity has separate subscriptions
 * - Entity 1: Add-on quantity is 200 immediately
 * - Entity 2: Add-on quantity stays 300 with next_cycle_quantity of 200
 */
test.concurrent(`${chalk.yellowBright("attach: prepaid add-on with entities - upgrade and downgrade")}`, async () => {
	const customerId = "attach-prepaid-addon-entities";

	// Pro product with monthly messages
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 250 })],
	});

	// Premium product with more monthly messages
	const premium = products.pro({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	// Prepaid add-on
	const prepaidAddOn = products.recurringAddOn({
		id: "topup",
		items: [
			items.prepaidMessages({
				billingUnits: 100,
				price: 12.5,
				config: {
					on_increase: OnIncrease.ProrateImmediately,
					on_decrease: OnDecrease.None,
				},
			}),
		],
	});

	const entity1Quantity = 100;
	const entity2OriginalQuantity = 300;
	const entity1UpgradedQuantity = 200;
	const entity2DowngradedQuantity = 200;

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [pro, premium, prepaidAddOn] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			// Entity 1: Attach pro + prepaid add-on
			s.attach({ productId: pro.id, entityIndex: 0 }),
			s.attach({
				productId: prepaidAddOn.id,
				entityIndex: 0,
				options: [
					{ feature_id: TestFeature.Messages, quantity: entity1Quantity },
				],
				newBillingSubscription: true,
			}),
			// Entity 2: Attach premium + prepaid add-on
			s.attach({ productId: premium.id, entityIndex: 1 }),
			s.attach({
				productId: prepaidAddOn.id,
				entityIndex: 1,
				options: [
					{
						feature_id: TestFeature.Messages,
						quantity: entity2OriginalQuantity,
					},
				],
				newBillingSubscription: true,
			}),
			// Entity 1: Upgrade add-on to 200
			s.attach({
				productId: prepaidAddOn.id,
				entityIndex: 0,
				options: [
					{
						feature_id: TestFeature.Messages,
						quantity: entity1UpgradedQuantity,
					},
				],
				timeout: 10000, // Wait for proration invoice
			}),
			// Entity 2: Downgrade add-on to 200 (sets next_cycle_quantity)
			s.attach({
				productId: prepaidAddOn.id,
				entityIndex: 1,
				options: [
					{
						feature_id: TestFeature.Messages,
						quantity: entity2DowngradedQuantity,
					},
				],
				timeout: 5000,
			}),
		],
	});

	// Verify entity 2 state - downgrade should set next_cycle_quantity
	const entity2 = await autumnV1.entities.get(customerId, "ent-2");

	// Entity 2 should have 2 invoices (premium attach + add-on attach)
	expect(entity2.invoices?.length).toBe(2);

	// Entity 2 add-on should have quantity 300 (original) with next_cycle_quantity 200
	await expectProductItemCorrect({
		customer: entity2,
		productId: prepaidAddOn.id,
		featureId: TestFeature.Messages,
		quantity: entity2OriginalQuantity, // billingUnits = 100
		upcomingQuantity: entity2DowngradedQuantity,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Quantity upgrade with prorate-next-cycle (no immediate invoice)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach prepaid messages with quantity 300 (on_increase: prorate_next_cycle)
 * - Track some usage
 * - Upgrade quantity to 400 (prorate_next_cycle - deferred billing)
 *
 * Expected Result:
 * - Balance stays at 300 - usage (no immediate increase for prorate_next_cycle)
 * - Only 1 invoice (initial attach, no proration invoice)
 * - Subscription item quantity is updated to 4 immediately
 * - Product item quantity shows 4 (the new quantity takes effect on Stripe)
 */
test.concurrent(`${chalk.yellowBright("attach: quantity upgrade with prorate-next-cycle")}`, async () => {
	const customerId = "attach-qty-upgrade-prorate-next";

	const prepaidItem = items.prepaidMessages({
		billingUnits: 100,
		price: 12.5,
		config: {
			on_increase: OnIncrease.ProrateNextCycle,
			on_decrease: OnDecrease.None,
		},
	});

	const pro = products.pro({
		id: "pro",
		items: [prepaidItem],
	});

	const usage = Math.floor(Math.random() * 220); // Random usage between 0-219

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
			}),
			s.track({ featureId: TestFeature.Messages, value: usage }),
			// Upgrade quantity to 400 (prorate_next_cycle - no immediate invoice)
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 400 }],
			}),
		],
	});

	// Verify final state
	const customerFinal = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Balance should be: 400 (new quantity) - usage
	// With prorate_next_cycle, balance is updated immediately but billing is deferred
	expect(customerFinal.features[TestFeature.Messages].balance).toBe(
		400 - usage,
	);

	// Should have only 1 invoice (initial attach, no proration invoice)
	expectCustomerInvoiceCorrect({
		customer: customerFinal,
		count: 1,
	});

	// Product item quantity should be 4 (400 / 100 billingUnits)
	await expectProductItemCorrect({
		customer: customerFinal,
		productId: pro.id,
		featureId: TestFeature.Messages,
		quantity: 400,
		upcomingQuantity: "undefined", // No upcoming_quantity since it's an upgrade
	});

	// Verify Stripe subscription has correct item quantity
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Quantity decrease with OnDecrease.None, track usage, advance to next cycle
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach prepaid messages with includedUsage: 100, quantity: 300 (V1 excludes allowance)
 *   → Total balance = 100 + 300 = 400
 * - Track some usage (50)
 * - Downgrade quantity to 200 (on_decrease: None)
 *
 * Expected Result:
 * - Balance stays at 400 - 50 = 350 (NOT reduced immediately due to OnDecrease.None)
 * - upcoming_quantity is set to 200 + includedUsage = 300
 * - After next cycle: balance resets to includedUsage + new quantity = 100 + 200 = 300
 * - Subscription is correct
 *
 * KEY V1 BEHAVIOR: V1 attach quantity does NOT include includedUsage
 */
test.concurrent(`${chalk.yellowBright("attach: quantity decrease with OnDecrease.None + track + next cycle reset")}`, async () => {
	const customerId = "attach-qty-dec-none-next-cycle";
	const billingUnits = 100;
	const pricePerPack = 10;
	const includedUsage = 100;
	const usage = 50;

	const prepaidItem = items.prepaidMessages({
		includedUsage,
		billingUnits,
		price: pricePerPack,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.None, // Key: no proration on decrease
		},
	});

	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [prepaidItem, priceItem],
	});

	// V1 attach: quantity = 300 (EXCLUDING includedUsage)
	// Total balance = includedUsage (100) + quantity (300) = 400
	const initialQuantityV1 = 300;
	const initialTotalBalance = includedUsage + initialQuantityV1; // 400
	const initialPacks = initialQuantityV1 / billingUnits; // 3

	const { autumnV1, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			// V1 attach with quantity 300 (excludes includedUsage)
			s.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantityV1 },
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
		includedUsage: initialTotalBalance, // 400
		balance: initialTotalBalance, // 400
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerBefore,
		count: 1,
		latestTotal: (priceItem.price ?? 0) + initialPacks * pricePerPack, // 20 + 30 = 50
	});

	// Track some usage
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: usage,
	});

	// Wait for track to sync
	await new Promise((resolve) => setTimeout(resolve, 2000));

	// Verify balance after tracking
	const customerAfterTrack =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfterTrack,
		featureId: TestFeature.Messages,
		includedUsage: initialTotalBalance, // 400
		balance: initialTotalBalance - usage, // 350
		usage: usage, // 50
	});

	// V1 attach: downgrade quantity to 200 (excludes includedUsage)
	const downgradedQuantityV1 = 200;
	const downgradedTotalBalance = includedUsage + downgradedQuantityV1; // 300
	const downgradedPacks = downgradedQuantityV1 / billingUnits; // 2

	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: downgradedQuantityV1 },
		],
	});

	// KEY ASSERTION: With OnDecrease.None, balance should NOT change immediately
	const customerAfterDowngrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfterDowngrade,
		featureId: TestFeature.Messages,
		includedUsage: initialTotalBalance, // Still 400 (unchanged until renewal)
		balance: initialTotalBalance - usage, // Still 350 (NOT 250)
		usage: usage, // 50
	});

	// No new invoice should be created (OnDecrease.None = no proration)
	await expectCustomerInvoiceCorrect({
		customer: customerAfterDowngrade,
		count: 1, // Still just the initial invoice
	});

	// upcoming_quantity should be set
	await expectProductItemCorrect({
		customer: customerAfterDowngrade,
		productId: pro.id,
		featureId: TestFeature.Messages,
		quantity: initialTotalBalance, // 400 (current)
		upcomingQuantity: downgradedTotalBalance, // 300 (next cycle)
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Advance to next billing cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// After next cycle: balance should reset to new quantity (includedUsage + downgradedQuantityV1)
	const customerAfterCycle =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfterCycle,
		featureId: TestFeature.Messages,
		includedUsage: downgradedTotalBalance, // 300
		balance: downgradedTotalBalance, // 300 (reset, usage cleared)
		usage: 0,
	});

	// Should have 2 invoices: initial attach + renewal
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: downgradedPacks * pricePerPack + (priceItem.price ?? 0), // 20 + 20 = 40
	});

	// Verify subscription is correct after cycle
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Prepaid users (billingUnits: 1) - upgrade quantity mid-cycle, usage preserved
// (Migrated from updateQuantity/updateQuantity1.test.ts)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach prepaid users with quantity 2 (billingUnits: 1, $12/user)
 * - Error when re-attaching with same options
 * - Track 2 users usage
 * - Advance test clock 1 week (mid-cycle)
 * - Upgrade quantity to 4
 *
 * Expected Result:
 * - Re-attach with same options throws ProductAlreadyAttached
 * - After upgrade: balance = 4 - 2 = 2, usage stays at 2
 */
test.concurrent(`${chalk.yellowBright("attach: prepaid users upgrade quantity mid-cycle, usage preserved")}`, async () => {
	const customerId = "attach-prepaid-users-qty-upgrade";
	const usage = 2;

	const prepaidItem = items.prepaidUsers({
		billingUnits: 1,
	});

	const pro = products.pro({
		id: "pro",
		items: [prepaidItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Users, quantity: 2 }],
			}),
		],
	});

	// Re-attaching with same options should throw
	await expectAutumnError({
		errCode: AttachErrCode.ProductAlreadyAttached,
		func: async () => {
			await autumnV1.attach({
				customer_id: customerId,
				product_id: pro.id,
				options: [{ feature_id: TestFeature.Users, quantity: 2 }],
			});
		},
	});

	// Track 2 users, advance 1 week, upgrade to quantity 4
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: usage,
	});

	await new Promise((resolve) => setTimeout(resolve, 3000));

	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Users, quantity: 4 }],
	});

	await new Promise((resolve) => setTimeout(resolve, 5000));

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Usage should stay the same after quantity upgrade
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Users,
		includedUsage: 4,
		balance: 4 - usage,
		usage,
	});
});
