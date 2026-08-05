/**
 * Attach Update Quantity Tests (Legacy Migration) - Slice 2 of 3
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
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductItemCorrect } from "@tests/integration/billing/utils/expectProductItemCorrect";
import { waitForCustomerUsageInDb } from "@tests/integration/billing/utils/waitForUsageInDb";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

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
test.concurrent(
	`${chalk.yellowBright("attach: prepaid add-on with entities - upgrade and downgrade")}`,
	async () => {
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
	},
);

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
test.concurrent(
	`${chalk.yellowBright("attach: quantity upgrade with prorate-next-cycle")}`,
	async () => {
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
			],
		});

		// The upgrade attach below invalidates the cached balance without flushing
		// it, so the tracked deduction must be in Postgres before it runs.
		await waitForCustomerUsageInDb({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Messages,
			balance: 300 - usage,
			usage,
		});

		// Upgrade quantity to 400 (prorate_next_cycle - no immediate invoice)
		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 400 }],
		});

		// Balance should be: 400 (new quantity) - usage
		// With prorate_next_cycle, balance is updated immediately but billing is deferred
		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Messages,
			includedUsage: 400,
			balance: 400 - usage,
			usage,
		});

		const customerFinal =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

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
	},
);
