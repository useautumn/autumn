/**
 * Legacy Add-on Merged Subscription Tests
 *
 * Migrated from:
 * - server/tests/merged/addOn/mergedAddOn2.test.ts (add-ons across 2 entities)
 * - server/tests/merged/addOn/mergedAddOn6.test.ts (add-on quantity updates across 3 entities)
 *
 * Tests V1 attach (s.attach) behavior for:
 * - Attaching prepaid add-ons to entities alongside base products
 * - Updating add-on prepaid quantities per entity (increase/decrease)
 * - Multiple entities with different base products + shared add-on
 */

import { test } from "bun:test";
import type { ApiEntityV0 } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Prepaid add-on across 2 entities with quantity update
// (from mergedAddOn2)
//
// Scenario:
// - Pro product with Credits feature (free, no price on the feature)
// - Prepaid add-on for Credits ($10 per 100 units)
// - 2 entities
// - Entity 1: Attach Pro, then add-on with 300 credits
// - Entity 2: Attach Pro, then add-on with 500 credits
// - Entity 2: Update add-on to 200 credits (decrease)
//
// Expected:
// - Both entities have Pro (active) + add-on (active)
// - Entity 1: 300 credits from add-on + includedUsage from Pro
// - Entity 2: After decrease, 200 credits from add-on + includedUsage from Pro
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-addon-merged 1: prepaid add-on across 2 entities")}`, async () => {
	const customerId = "legacy-addon-merged-2ent";
	const billingUnits = 100;

	const creditsItem = items.monthlyCredits({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [creditsItem] });

	const prepaidCredits = items.prepaid({
		featureId: TestFeature.Credits,
		billingUnits,
		price: 10,
	});
	const addOn = products.base({
		id: "addon",
		items: [prepaidCredits],
		isAddOn: true,
	});

	const entity1AddonQty = billingUnits * 3; // 300
	const entity2AddonQty = billingUnits * 5; // 500
	const entity2DecreasedQty = billingUnits * 2; // 200

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addOn] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			// Entity 1: Attach Pro
			s.attach({ productId: pro.id, entityIndex: 0 }),
			// Entity 2: Attach Pro
			s.attach({ productId: pro.id, entityIndex: 1 }),
			// Entity 1: Attach add-on with 300 credits
			s.attach({
				productId: addOn.id,
				entityIndex: 0,
				options: [
					{ feature_id: TestFeature.Credits, quantity: entity1AddonQty },
				],
			}),
			// Entity 2: Attach add-on with 500 credits
			s.attach({
				productId: addOn.id,
				entityIndex: 1,
				options: [
					{ feature_id: TestFeature.Credits, quantity: entity2AddonQty },
				],
			}),
		],
	});

	// Verify entity 1: Pro + add-on active
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectCustomerProducts({
		customer: entity1,
		active: [pro.id, addOn.id],
	});

	// Verify entity 2: Pro + add-on active
	let entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	await expectCustomerProducts({
		customer: entity2,
		active: [pro.id, addOn.id],
	});

	// Entity 2: Update add-on to 200 credits (decrease)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: addOn.id,
		entity_id: entities[1].id,
		options: [
			{ feature_id: TestFeature.Credits, quantity: entity2DecreasedQty },
		],
	});

	// Re-verify entity 2 still has both products active
	entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	await expectCustomerProducts({
		customer: entity2,
		active: [pro.id, addOn.id],
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
// TEST 2: Add-on quantity updates across 3 entities with mixed base products
// (from mergedAddOn6)
//
// Scenario:
// - Premium ($50) and Pro ($20) base products with Credits feature
// - Prepaid add-on for Credits ($10 per 100 units)
// - 3 entities
// - Entity 1: Attach Premium, then add-on with 300 credits
// - Entity 2: Attach Premium, then add-on with 500 credits
// - Entity 3: Attach Pro, then add-on with 300 credits
// - Entity 1: Update add-on to 500 credits (increase)
//
// Expected:
// - Entity 1: Premium + add-on (500 credits after update)
// - Entity 2: Premium + add-on (500 credits)
// - Entity 3: Pro + add-on (300 credits)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-addon-merged 2: add-on updates across 3 entities with mixed products")}`, async () => {
	const customerId = "legacy-addon-merged-3ent";
	const billingUnits = 100;

	const creditsItem = items.monthlyCredits({ includedUsage: 100 });
	const premium = products.premium({
		id: "premium",
		items: [creditsItem],
	});
	const pro = products.pro({ id: "pro", items: [creditsItem] });

	const prepaidCredits = items.prepaid({
		featureId: TestFeature.Credits,
		billingUnits,
		price: 10,
	});
	const addOn = products.base({
		id: "addon",
		items: [prepaidCredits],
		isAddOn: true,
	});

	const ent1AddonQty = billingUnits * 3; // 300
	const ent2AddonQty = billingUnits * 5; // 500
	const ent3AddonQty = billingUnits * 3; // 300
	const ent1UpdatedQty = billingUnits * 5; // 500

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium, addOn] }),
			s.entities({ count: 3, featureId: TestFeature.Users }),
		],
		actions: [
			// Entity 1: Premium + add-on (300)
			s.attach({ productId: premium.id, entityIndex: 0 }),
			s.attach({
				productId: addOn.id,
				entityIndex: 0,
				options: [{ feature_id: TestFeature.Credits, quantity: ent1AddonQty }],
			}),
			// Entity 2: Premium + add-on (500)
			s.attach({ productId: premium.id, entityIndex: 1 }),
			s.attach({
				productId: addOn.id,
				entityIndex: 1,
				options: [{ feature_id: TestFeature.Credits, quantity: ent2AddonQty }],
			}),
			// Entity 3: Pro + add-on (300)
			s.attach({ productId: pro.id, entityIndex: 2 }),
			s.attach({
				productId: addOn.id,
				entityIndex: 2,
				options: [{ feature_id: TestFeature.Credits, quantity: ent3AddonQty }],
			}),
		],
	});

	// Verify all 3 entities have their base product + add-on
	for (let i = 0; i < 3; i++) {
		const entity = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[i].id,
		);
		const baseProduct = i < 2 ? premium.id : pro.id;
		await expectCustomerProducts({
			customer: entity,
			active: [baseProduct, addOn.id],
		});
	}

	// Entity 1: Update add-on to 500 credits (increase)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: addOn.id,
		entity_id: entities[0].id,
		options: [{ feature_id: TestFeature.Credits, quantity: ent1UpdatedQty }],
	});

	// Verify entity 1 still has Premium + add-on active after update
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectCustomerProducts({
		customer: entity1,
		active: [premium.id, addOn.id],
	});

	// Verify subscription correctness
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
