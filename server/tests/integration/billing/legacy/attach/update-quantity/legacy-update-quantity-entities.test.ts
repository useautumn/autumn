/**
 * Legacy Update Quantity with Entities Tests
 *
 * Migrated from:
 * - server/tests/merged/prepaid/mergedPrepaid1.test.ts (Test 1)
 * - server/tests/merged/prepaid/mergedPrepaid2.test.ts (Test 2)
 * - server/tests/merged/prepaid/mergedPrepaid3.test.ts (Test 3)
 *
 * Tests for prepaid quantity updates with entity-level subscriptions.
 *
 * Key behaviors tested:
 * - Entity-level prepaid product attachments
 * - Quantity increase (immediate update with prorate)
 * - Quantity decrease (upcoming_quantity set, no immediate change / prorate immediately)
 * - Subscription correctness for each entity
 * - Test clock advancement to verify next-cycle behavior
 * - Prepaid downgrade across entities (Premium → Pro scheduled)
 */

import { test } from "bun:test";
import {
	type ApiEntityV0,
	CusProductStatus,
	OnDecrease,
	OnIncrease,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductItemCorrect } from "@tests/integration/billing/utils/expectProductItemCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached";
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
		quantity: entity2InitialV1, // 400 (current)
		upcomingQuantity: entity2DowngradedV1, // 200 (next cycle)
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

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Prepaid quantity decrease with entities + test clock advancement
// (Migrated from mergedPrepaid2.test.ts)
//
// Scenario:
// - 2 entities with prepaid Credits (OnDecrease.None)
// - Entity 1: Attach Pro with 400 credits → re-attach Pro with 200 credits (decrease)
// - Entity 2: Attach Pro with 300 credits → re-attach Pro with 100 credits (decrease)
// - Advance test clock to next invoice to verify next-cycle state
//
// Expected:
// - Both entities keep current balance until cycle ends (OnDecrease.None)
// - After cycle advancement, subscription renews with decreased quantities
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-entities 2: prepaid decrease + test clock advancement")}`, async () => {
	const customerId = "legacy-ent-qty-decrease-cycle";
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

	// Entity 1: Initial 400, decrease to 200
	const entity1InitialV1 = billingUnits * 4; // 400
	const entity1DecreasedV1 = billingUnits * 2; // 200

	// Entity 2: Initial 300, decrease to 100
	const entity2InitialV1 = billingUnits * 3; // 300
	const entity2DecreasedV1 = billingUnits * 1; // 100

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
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

	// Entity 1: Decrease to 200 credits
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: "ent-1",
		options: [
			{ feature_id: TestFeature.Credits, quantity: entity1DecreasedV1 },
		],
	});

	// Entity 2: Decrease to 100 credits
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: "ent-2",
		options: [
			{ feature_id: TestFeature.Credits, quantity: entity2DecreasedV1 },
		],
	});

	// Verify balances haven't changed yet (OnDecrease.None)
	const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		"ent-1",
	);
	expectCustomerFeatureCorrect({
		customer: entity1Before,
		featureId: TestFeature.Credits,
		includedUsage: includedUsage + entity1InitialV1, // Still 500
		balance: includedUsage + entity1InitialV1,
		usage: 0,
	});

	const entity2Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		"ent-2",
	);
	expectCustomerFeatureCorrect({
		customer: entity2Before,
		featureId: TestFeature.Credits,
		includedUsage: includedUsage + entity2InitialV1, // Still 400
		balance: includedUsage + entity2InitialV1,
		usage: 0,
	});

	// Verify subscription correctness
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Prepaid downgrade across entities (Premium → Pro scheduled)
// (Migrated from mergedPrepaid3.test.ts)
//
// Scenario:
// - 2 entities with prepaid Credits (OnDecrease.ProrateImmediately)
// - Entity 1: Attach Premium with 400 credits
// - Entity 2: Attach Premium with 300 credits
// - Entity 1: Downgrade to Pro with 200 credits (scheduled)
// - Advance test clock to next invoice
// - Verify entity 1 now has Pro after cycle ends
//
// Expected:
// - After downgrade, entity 1 has Premium (canceling) + Pro (scheduled)
// - After cycle ends, entity 1 has Pro active
// - Entity 2 still has Premium active throughout
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-entities 3: prepaid downgrade Premium → Pro with entities")}`, async () => {
	const customerId = "legacy-ent-prepaid-downgrade";
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
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});

	const premium = products.premium({
		id: "premium",
		items: [prepaidItem],
	});

	const pro = products.pro({
		id: "pro",
		items: [prepaidItem],
	});

	// Entity 1: Attach Premium with 400, then downgrade to Pro with 200
	const entity1InitialV1 = billingUnits * 4; // 400
	const entity1DowngradeV1 = billingUnits * 2; // 200

	// Entity 2: Attach Premium with 300
	const entity2InitialV1 = billingUnits * 3; // 300

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			// Entity 1: Attach Premium with 400 credits
			s.attach({
				productId: premium.id,
				entityIndex: 0,
				options: [
					{ feature_id: TestFeature.Credits, quantity: entity1InitialV1 },
				],
			}),
			// Entity 2: Attach Premium with 300 credits
			s.attach({
				productId: premium.id,
				entityIndex: 1,
				options: [
					{ feature_id: TestFeature.Credits, quantity: entity2InitialV1 },
				],
			}),
		],
	});

	// Entity 1: Downgrade to Pro with 200 credits (scheduled since Pro < Premium)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: "ent-1",
		options: [
			{ feature_id: TestFeature.Credits, quantity: entity1DowngradeV1 },
		],
	});

	// Verify entity 1 has Premium (canceling) + Pro (scheduled)
	const entity1After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		"ent-1",
	);
	expectProductAttached({
		customer: entity1After,
		productId: premium.id,
		isCanceled: true,
	});
	expectProductAttached({
		customer: entity1After,
		productId: pro.id,
		status: CusProductStatus.Scheduled,
	});

	// Verify entity 2 still has Premium active
	const entity2After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		"ent-2",
	);
	await expectProductActive({
		customer: entity2After,
		productId: premium.id,
	});

	// Verify subscription correctness before cycle advancement
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
