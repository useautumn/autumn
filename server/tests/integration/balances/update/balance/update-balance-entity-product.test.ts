import { expect, test } from "bun:test";
import type { ApiCustomer, ApiEntityV1 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/**
 * Tests for updating entity balance when products are attached to entities directly.
 * These tests have products attached to entities (not via entityFeatureId on customer product).
 *
 * NEW BEHAVIOR: granted_balance does NOT change when only current_balance is passed.
 * Instead, usage = granted_balance - current_balance.
 */

// =============================================================================
// Test: update-balance-entity-product1 - entity products
// =============================================================================
test.concurrent(`${chalk.yellowBright("update-balance-entity-product1: entity products")}`, async () => {
	const entityProd = products.base({
		id: "entity-prod",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { customerId, autumnV2, entities } = await initScenario({
		customerId: "update-entity-prod1",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [entityProd] }),
			s.entities({ count: 3, featureId: TestFeature.Users }),
		],
		actions: [
			// Attach product to each entity (not to customer)
			s.attach({ productId: entityProd.id, entityIndex: 0 }),
			s.attach({ productId: entityProd.id, entityIndex: 1 }),
			s.attach({ productId: entityProd.id, entityIndex: 2 }),
		],
	});

	// Initialize caches
	await autumnV2.customers.get(customerId);
	for (const entity of entities) {
		await autumnV2.entities.get(customerId, entity.id);
	}

	// Initial: customer has 300 (100 per entity × 3), each entity 100
	const customer0 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer0.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 300,
		usage: 0,
	});

	for (const entity of entities) {
		const fetchedEntity = (await autumnV2.entities.get(
			customerId,
			entity.id,
		)) as ApiEntityV1;
		expect(fetchedEntity.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 100,
			current_balance: 100,
			usage: 0,
		});
	}

	// Update 1: first entity balance from 100 to 80
	// NEW: granted stays 100, current 80, usage 20
	await autumnV2.balances.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		current_balance: 80,
	});

	const entity1After1 = await autumnV2.entities.get<ApiEntityV1>(
		customerId,
		entities[0].id,
	);
	expect(entity1After1.balances![TestFeature.Messages]).toMatchObject({
		granted_balance: 100, // Unchanged
		current_balance: 80,
		usage: 20, // 100 - 80
	});

	// Other entities unchanged
	const entity2After1 = await autumnV2.entities.get<ApiEntityV1>(
		customerId,
		entities[1].id,
	);
	expect(entity2After1.balances![TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 100,
		usage: 0,
	});

	// Customer balance: granted 300, current 280 (80 + 100 + 100)
	const customer1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer1.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300, // Unchanged
		current_balance: 280,
		usage: 20, // 300 - 280
	});

	// Update 2: second entity balance from 100 to 150 (increase)
	// NEW: granted stays 100, current 150, usage -50 (credit)
	await autumnV2.balances.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		feature_id: TestFeature.Messages,
		current_balance: 150,
	});

	const entity2After2 = await autumnV2.entities.get<ApiEntityV1>(
		customerId,
		entities[1].id,
	);
	expect(entity2After2.balances![TestFeature.Messages]).toMatchObject({
		granted_balance: 100, // Unchanged
		current_balance: 150,
		usage: -50, // 100 - 150 = -50 (credit)
	});

	// Customer balance: granted 300, current 330 (80 + 150 + 100)
	const customer2 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer2.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300, // Unchanged
		current_balance: 330,
		usage: -30, // 20 - 50 = -30
	});

	// Update 3: customer level update from 330 to 165 (sequential deduction)
	// NEW: granted stays 300, usage becomes 135
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 165,
	});

	// Customer should have 165
	const customer3 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer3.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300, // Unchanged
		current_balance: 165,
		usage: 135, // 300 - 165
	});

	// Verify DB sync
	const customerFromDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 165,
		usage: 135,
	});
});

// =============================================================================
// Test: update-balance-entity-product2 - mixed customer and entity products
// =============================================================================
test.concurrent(`${chalk.yellowBright("update-balance-entity-product2: mixed customer and entity products")}`, async () => {
	const customerProd = products.base({
		id: "customer-prod",
		items: [items.monthlyMessages({ includedUsage: 50 })],
	});
	const entityProd = products.base({
		id: "entity-prod",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { customerId, autumnV2, entities } = await initScenario({
		customerId: "update-entity-prod2",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [customerProd, entityProd] }),
			s.entities({ count: 3, featureId: TestFeature.Users }),
		],
		actions: [
			// Attach customer product
			s.attach({ productId: customerProd.id }),
			// Attach entity product to each entity
			s.attach({ productId: entityProd.id, entityIndex: 0 }),
			s.attach({ productId: entityProd.id, entityIndex: 1 }),
			s.attach({ productId: entityProd.id, entityIndex: 2 }),
		],
	});

	// Initialize caches
	await autumnV2.customers.get(customerId);
	for (const entity of entities) {
		await autumnV2.entities.get(customerId, entity.id);
	}

	// Initial: customer has 350 (50 customer + 100×3 entity = 350)
	// Each entity sees 150 (50 customer-level + 100 entity-level)
	const customer0 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer0.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 350,
		current_balance: 350,
		usage: 0,
	});

	for (const entity of entities) {
		const fetchedEntity = (await autumnV2.entities.get(
			customerId,
			entity.id,
		)) as ApiEntityV1;
		expect(fetchedEntity.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 150, // 50 + 100
			current_balance: 150,
			usage: 0,
		});
	}

	// Update 1: first entity balance from 150 to 100
	// NEW: granted stays 150, current 100, usage 50
	await autumnV2.balances.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		current_balance: 100,
	});

	const entity1After1 = await autumnV2.entities.get<ApiEntityV1>(
		customerId,
		entities[0].id,
	);
	expect(entity1After1.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 150, // Unchanged
		current_balance: 100,
		usage: 50, // 150 - 100
	});

	// Customer balance: granted 350, current 300 (350 - 50)
	const customer1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer1.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 350, // Unchanged
		current_balance: 300,
		usage: 50, // 350 - 300
	});

	// Update 2: second entity balance from 150 to 200 (increase)
	// NEW: granted stays 150, current 200, usage -50 (credit)
	await autumnV2.balances.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		feature_id: TestFeature.Messages,
		current_balance: 200,
	});

	const entity2After2 = await autumnV2.entities.get<ApiEntityV1>(
		customerId,
		entities[1].id,
	);
	expect(entity2After2.balances![TestFeature.Messages]).toMatchObject({
		granted_balance: 150, // Unchanged
		current_balance: 200,
		usage: -50, // 150 - 200 = -50 (credit)
	});

	// Customer balance: granted 350, current 350 (300 + 50)
	const customer2 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer2.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 350, // Unchanged
		current_balance: 350,
		usage: 0, // 50 - 50 = 0
	});

	// Update 3: customer balance from 350 to 175 (sequential deduction)
	// NEW: granted stays 350, usage becomes 175
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 175,
	});

	const customer3 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer3.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 350, // Unchanged
		current_balance: 175,
		usage: 175, // 350 - 175
	});

	// Track on entity 2, then update customer balance
	await autumnV2.track({
		customer_id: customerId,
		entity_id: entities[1].id,
		feature_id: TestFeature.Messages,
		value: 30,
	});

	const entity2AfterTrack = (await autumnV2.entities.get(
		customerId,
		entities[1].id,
	)) as ApiEntityV1;
	// After track: current decreased by 30
	const entity2BalanceAfterTrack =
		entity2AfterTrack.balances?.[TestFeature.Messages];
	expect(entity2BalanceAfterTrack?.current_balance).toBeLessThan(
		entity2AfterTrack.balances?.[TestFeature.Messages]?.granted_balance ?? 0,
	);

	// Customer should have decreased by 30
	const customerAfterTrack =
		await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customerAfterTrack.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 350,
		current_balance: 145, // 175 - 30
		usage: 205, // 175 + 30 = 205
	});

	await timeout(6000);

	// Verify DB sync
	const customerFromDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 350,
		current_balance: 145,
		usage: 205,
	});
});
