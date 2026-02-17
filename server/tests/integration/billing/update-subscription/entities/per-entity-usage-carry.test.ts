import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// =============================================================================
// VERSION UPDATE ENTITY USAGE CARRY-OVER TESTS
// Tests that per-entity usage is properly carried over when updating to a new
// product version. Reproduces the bug where entity balances reset to the full
// grant amount instead of preserving existing usage.
// =============================================================================

// =============================================================================
// TEST 1: Version update carries over per-entity usage (consumable)
// Scenario: Usage-based plan with 6000 grant per entity, entities have used
// varying amounts. After version update, usage should be preserved.
// =============================================================================
test.concurrent(`${chalk.yellowBright("entity version carry: consumable per-entity usage preserved after version update")}`, async () => {
	const includedUsage = 6000;

	// v1: consumable per-entity messages with 6000 grant, $0.005/unit
	const consumablePerEntity = items.consumable({
		featureId: TestFeature.Messages,
		includedUsage,
		price: 0.005,
		billingUnits: 1,
		entityFeatureId: TestFeature.Users,
	});
	const priceItem = items.monthlyPrice({ price: 30 });

	const pro = products.base({
		id: "pro",
		items: [consumablePerEntity, priceItem],
	});

	const { customerId, autumnV1, ctx, entities } = await initScenario({
		customerId: "ver-ent-carry-cons",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 3, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: pro.id, timeout: 4000 })],
	});

	// Track usage on each entity
	const entity1Usage = 6000; // Uses entire grant
	const entity2Usage = 6000; // Uses entire grant
	const entity3Usage = 10000; // Goes into overage (4000 over)

	await autumnV1.track(
		{
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: entity1Usage,
		},
		{ timeout: 2000 },
	);

	await autumnV1.track(
		{
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			value: entity2Usage,
		},
		{ timeout: 2000 },
	);

	await autumnV1.track(
		{
			customer_id: customerId,
			entity_id: entities[2].id,
			feature_id: TestFeature.Messages,
			value: entity3Usage,
		},
		{ timeout: 2000 },
	);

	// Verify pre-update entity balances
	const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	expect(entity1Before.features?.[TestFeature.Messages]?.balance).toBe(
		includedUsage - entity1Usage, // 0
	);

	const entity2Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	expect(entity2Before.features?.[TestFeature.Messages]?.balance).toBe(
		includedUsage - entity2Usage, // 0
	);

	const entity3Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[2].id,
	);
	expect(entity3Before.features?.[TestFeature.Messages]?.balance).toBe(
		includedUsage - entity3Usage, // -4000
	);

	// Create v2 of the product (same features, slightly different price to trigger version)
	const v2ConsumablePerEntity = items.consumable({
		featureId: TestFeature.Messages,
		includedUsage,
		price: 0.015,
		billingUnits: 1,
		entityFeatureId: TestFeature.Users,
	});

	await autumnV1.products.update(pro.id, {
		items: [v2ConsumablePerEntity, priceItem],
	});

	// Update subscription to v2
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
	});

	// Verify entity balances after version update - usage should be preserved
	const entity1After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity1After,
		featureId: TestFeature.Messages,
		includedUsage,
		balance: includedUsage - entity1Usage, // 6000 - 6000 = 0
		usage: entity1Usage,
	});

	const entity2After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity2After,
		featureId: TestFeature.Messages,
		includedUsage,
		balance: includedUsage - entity2Usage, // 6000 - 6000 = 0
		usage: entity2Usage,
	});

	const entity3After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[2].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity3After,
		featureId: TestFeature.Messages,
		includedUsage,
		balance: includedUsage - entity3Usage, // 6000 - 10000 = -4000
		usage: entity3Usage,
	});

	// Verify customer total balance
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const totalUsage = entity1Usage + entity2Usage + entity3Usage;
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: includedUsage * 3,
		balance: includedUsage * 3 - totalUsage, // 18000 - 22000 = -4000
		usage: totalUsage,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// =============================================================================
// TEST 2: Version update carries over per-entity usage (free metered)
// Similar scenario but with free metered feature (no overage pricing).
// Entities have partial usage that should be preserved across version update.
// =============================================================================
test.concurrent(`${chalk.yellowBright("entity version carry: free metered per-entity usage preserved after version update")}`, async () => {
	const includedUsage = 6000;

	// v1: free metered per-entity messages with 6000 grant
	const perEntityMessages = items.monthlyMessages({
		includedUsage,
		entityFeatureId: TestFeature.Users,
	});

	const free = products.base({
		id: "free",
		items: [perEntityMessages],
	});

	const { customerId, autumnV1, entities } = await initScenario({
		customerId: "ver-ent-carry-free",
		setup: [
			s.customer({}),
			s.products({ list: [free] }),
			s.entities({ count: 3, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: free.id })],
	});

	// Track partial usage on each entity
	const entity1Usage = 1000;
	const entity2Usage = 3000;
	const entity3Usage = 6000; // Uses entire grant

	await autumnV1.track(
		{
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: entity1Usage,
		},
		{ timeout: 2000 },
	);

	await autumnV1.track(
		{
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			value: entity2Usage,
		},
		{ timeout: 2000 },
	);

	await autumnV1.track(
		{
			customer_id: customerId,
			entity_id: entities[2].id,
			feature_id: TestFeature.Messages,
			value: entity3Usage,
		},
		{ timeout: 2000 },
	);

	// Verify pre-update balances
	const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	expect(entity1Before.features?.[TestFeature.Messages]?.balance).toBe(
		includedUsage - entity1Usage, // 5000
	);

	const entity3Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[2].id,
	);
	expect(entity3Before.features?.[TestFeature.Messages]?.balance).toBe(
		includedUsage - entity3Usage, // 0
	);

	// Create v2 - increase included usage to 8000 per entity
	const v2IncludedUsage = 8000;
	const v2PerEntityMessages = items.monthlyMessages({
		includedUsage: v2IncludedUsage,
		entityFeatureId: TestFeature.Users,
	});

	await autumnV1.products.update(free.id, {
		items: [v2PerEntityMessages],
	});

	// Update subscription to v2
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: free.id,
		version: 2,
	});

	// Verify entity balances after version update - usage should be preserved
	// with the new grant amount
	const entity1After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity1After,
		featureId: TestFeature.Messages,
		includedUsage: v2IncludedUsage,
		balance: v2IncludedUsage - entity1Usage, // 8000 - 1000 = 7000
		usage: entity1Usage,
	});

	const entity2After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity2After,
		featureId: TestFeature.Messages,
		includedUsage: v2IncludedUsage,
		balance: v2IncludedUsage - entity2Usage, // 8000 - 3000 = 5000
		usage: entity2Usage,
	});

	const entity3After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[2].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity3After,
		featureId: TestFeature.Messages,
		includedUsage: v2IncludedUsage,
		balance: v2IncludedUsage - entity3Usage, // 8000 - 6000 = 2000
		usage: entity3Usage,
	});

	// Verify customer total balance
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const totalUsage = entity1Usage + entity2Usage + entity3Usage;
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: v2IncludedUsage * 3,
		balance: v2IncludedUsage * 3 - totalUsage, // 24000 - 10000 = 14000
		usage: totalUsage,
	});
});

// =============================================================================
// TEST 3: Version update with same grant amount - entity usage must carry
// Closest replication of the reported bug: same grant amount in v1 and v2,
// entities with full usage get reset to full balance instead of 0.
// =============================================================================
test.concurrent(`${chalk.yellowBright("entity version carry: same grant version update does not reset entity balances")}`, async () => {
	const includedUsage = 6000;

	// v1: consumable per-entity with 6000 grant
	const consumablePerEntity = items.consumable({
		featureId: TestFeature.Messages,
		includedUsage,
		price: 0.005,
		billingUnits: 1,
		entityFeatureId: TestFeature.Users,
	});
	const priceItem = items.monthlyPrice({ price: 30 });

	const pro = products.base({
		id: "pro",
		items: [consumablePerEntity, priceItem],
	});

	const entityCount = 5;
	const { customerId, autumnV1, ctx, entities } = await initScenario({
		customerId: "ver-ent-carry-same",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: entityCount, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: pro.id, timeout: 4000 })],
	});

	// Track all entities to use their full grant (matches reported bug scenario)
	for (let i = 0; i < entityCount; i++) {
		await autumnV1.track(
			{
				customer_id: customerId,
				entity_id: entities[i].id,
				feature_id: TestFeature.Messages,
				value: includedUsage, // Use entire 6000 grant
			},
			{ timeout: 2000 },
		);
	}

	// Verify all entities are at 0 balance before update
	for (let i = 0; i < entityCount; i++) {
		const entityBefore = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[i].id,
		);
		expect(entityBefore.features?.[TestFeature.Messages]?.balance).toBe(0);
	}

	// Verify customer total balance is 0
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features?.[TestFeature.Messages]?.balance).toBe(0);

	// Create v2 with identical items (same grant, same price)
	const v2ConsumablePerEntity = items.consumable({
		featureId: TestFeature.Messages,
		includedUsage,
		price: 0.015,
		billingUnits: 1,
		entityFeatureId: TestFeature.Users,
	});
	const v2PriceItem = items.monthlyPrice({ price: 30 });

	await autumnV1.products.update(pro.id, {
		items: [v2ConsumablePerEntity, v2PriceItem],
	});

	// Update subscription to v2
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
	});

	// BUG CHECK: All entity balances should still be 0 (usage carried over)
	// The bug causes them to reset to 6000 (full grant) instead
	for (let i = 0; i < entityCount; i++) {
		const entityAfter = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[i].id,
		);
		expectCustomerFeatureCorrect({
			customer: entityAfter,
			featureId: TestFeature.Messages,
			includedUsage,
			balance: 0, // Should be 0 (6000 grant - 6000 usage), NOT 6000
			usage: includedUsage,
		});
	}

	// Verify customer total balance is also 0
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: includedUsage * entityCount,
		balance: 0, // Should be 0, NOT 30000
		usage: includedUsage * entityCount,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
