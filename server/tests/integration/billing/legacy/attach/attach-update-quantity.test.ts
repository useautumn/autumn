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
import { type ApiCustomerV3, OnDecrease, OnIncrease } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductItemCorrect } from "@tests/integration/billing/utils/expectProductItemCorrect";
import { calculateProratedCharge } from "@tests/integration/billing/utils/stripeSubscriptionUtils";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
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
test(`${chalk.yellowBright("attach: quantity upgrade mid-cycle with prorate immediately")}`, async () => {
	const customerId = "attach-qty-upgrade-mid-cycle";

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
		400 - usage,
	);

	const upgradeQuantity = 400 - 300;
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
test(`${chalk.yellowBright("attach: quantity decrease → increase → decrease flow")}`, async () => {
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
		product_id: `${pro.id}_${customerId}`,
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
		quantity: 3, // Still 300 / 100
		upcomingQuantity: 2, // 200 / 100
	});

	// Increase to 400 (prorate_immediately - creates invoice, immediate change)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: `${pro.id}_${customerId}`,
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
		product_id: `${pro.id}_${customerId}`,
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
		quantity: 4, // Still 400 / 100
		upcomingQuantity: 2, // 200 / 100
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
test(`${chalk.yellowBright("attach: prepaid add-on with entities - upgrade and downgrade")}`, async () => {
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
		quantity: entity2OriginalQuantity / 100, // billingUnits = 100
		upcomingQuantity: entity2DowngradedQuantity / 100,
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
test(`${chalk.yellowBright("attach: quantity upgrade with prorate-next-cycle")}`, async () => {
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
		quantity: 4, // 400 / 100 billingUnits
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
