/**
 * Legacy Update Quantity with Entities Tests
 *
 * Migrated from: server/tests/merged/prepaid/mergedPrepaid1.test.ts
 *
 * Tests for prepaid quantity updates with entity-level subscriptions.
 *
 * Scenario:
 * - 2 entities with prepaid credits (includedUsage: 100, billingUnits: 100)
 * - Entity 1: Attach pro with 400 credits → update to 500 credits (increase)
 * - Entity 2: Attach pro with 300 credits → update to 100 credits (decrease)
 *
 * Key behaviors tested:
 * - Entity-level prepaid product attachments
 * - Quantity increase (immediate update with prorate)
 * - Quantity decrease (upcoming_quantity set, no immediate change)
 * - Subscription correctness for each entity
 */

import { test } from "bun:test";
import { type ApiEntityV0, OnDecrease, OnIncrease } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductItemCorrect } from "@tests/integration/billing/utils/expectProductItemCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST: Multiple entities with prepaid quantity increase and decrease
// (Migrated from mergedPrepaid1.test.ts)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Create 2 entities
 * - Entity 1: Attach pro with 400 credits → update to 500 credits (increase)
 * - Entity 2: Attach pro with 300 credits → update to 100 credits (decrease)
 *
 * Expected Result:
 * - Entity 1: Balance increases to 600 immediately (ProrateImmediately)
 * - Entity 2: Balance stays at 400, upcoming_quantity = 200 (OnDecrease.None)
 * - Both subscriptions are correct
 */
test.concurrent(`${chalk.yellowBright("legacy-entities: prepaid quantity increase and decrease")}`, async () => {
	const customerId = "legacy-ent-qty-ops";
	const billingUnits = 100;
	const pricePerPack = 10;
	const includedUsage = 100;

	const prepaidItem = items.prepaid({
		featureId: TestFeature.Credits,
		includedUsage,
		billingUnits,
		price: pricePerPack,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.None,
		},
	});

	const pro = products.pro({
		id: "pro",
		items: [prepaidItem],
	});

	// Entity 1: Initial 400, upgrade to 500
	const entity1InitialV1 = billingUnits * 4; // 400
	const entity1UpgradedV1 = billingUnits * 5; // 500
	const entity1UpgradedTotal = includedUsage + entity1UpgradedV1; // 600

	// Entity 2: Initial 300, downgrade to 100
	const entity2InitialV1 = billingUnits * 3; // 300
	const entity2InitialTotal = includedUsage + entity2InitialV1; // 400
	const entity2DowngradedV1 = billingUnits * 1; // 100
	const entity2DowngradedTotal = includedUsage + entity2DowngradedV1; // 200

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			// Entity 1: Attach pro with 400 credits
			s.attach({
				productId: pro.id,
				entityIndex: 0,
				options: [
					{ feature_id: TestFeature.Credits, quantity: entity1InitialV1 },
				],
			}),
			// Entity 2: Attach pro with 300 credits
			s.attach({
				productId: pro.id,
				entityIndex: 1,
				options: [
					{ feature_id: TestFeature.Credits, quantity: entity2InitialV1 },
				],
			}),
		],
	});

	// Entity 1: Upgrade to 500 credits (increase)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: "ent-1",
		options: [{ feature_id: TestFeature.Credits, quantity: entity1UpgradedV1 }],
	});

	// Wait for proration invoice
	await new Promise((resolve) => setTimeout(resolve, 5000));

	// Entity 2: Downgrade to 100 credits (decrease)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: "ent-2",
		options: [
			{ feature_id: TestFeature.Credits, quantity: entity2DowngradedV1 },
		],
	});

	// Verify Entity 1: Balance should have increased
	const entity1After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		"ent-1",
	);
	await expectProductActive({ customer: entity1After, productId: pro.id });
	expectCustomerFeatureCorrect({
		customer: entity1After,
		featureId: TestFeature.Credits,
		includedUsage: entity1UpgradedTotal, // 600
		balance: entity1UpgradedTotal, // 600
		usage: 0,
	});

	// Verify Entity 2: Balance should NOT have changed (OnDecrease.None)
	const entity2After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		"ent-2",
	);
	await expectProductActive({ customer: entity2After, productId: pro.id });
	expectCustomerFeatureCorrect({
		customer: entity2After,
		featureId: TestFeature.Credits,
		includedUsage: entity2InitialTotal, // Still 400
		balance: entity2InitialTotal, // Still 400
		usage: 0,
	});

	// Entity 2: upcoming_quantity should be set
	await expectProductItemCorrect({
		customer: entity2After,
		productId: pro.id,
		featureId: TestFeature.Credits,
		quantity: entity2InitialTotal, // 400 (current)
		upcomingQuantity: entity2DowngradedTotal, // 200 (next cycle)
	});

	// Verify subscriptions are correct for both entities
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		entityId: "ent-1",
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		entityId: "ent-2",
	});
});
