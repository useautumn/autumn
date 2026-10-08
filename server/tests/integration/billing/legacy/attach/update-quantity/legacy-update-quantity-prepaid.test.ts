/**
 * Attach Update Quantity Tests (Legacy Migration): mid-cycle attach quantity changes and entity-level
 * prepaid add-ons (migrated from server/tests/attach/prepaid/prepaid2.test.ts and prepaid5.test.ts).
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, OnDecrease, OnIncrease } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectProductItemCorrect } from "@tests/integration/billing/utils/expectProductItemCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
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
test.concurrent(
	`${chalk.yellowBright("attach: prepaid users upgrade quantity mid-cycle, usage preserved")}`,
	async () => {
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

		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Usage should stay the same after quantity upgrade
		expectCustomerFeatureCorrect({
			customer: customerAfter,
			featureId: TestFeature.Users,
			includedUsage: 4,
			balance: 4 - usage,
			usage,
		});
	},
);
