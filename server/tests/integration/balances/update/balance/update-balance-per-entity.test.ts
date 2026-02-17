import { expect, test } from "bun:test";
import type { ApiCustomer, ApiEntityV1, CheckResponseV2 } from "@autumn/shared";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { timeout } from "@/utils/genUtils";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";

/**
 * Tests for updating per-entity balance items (where entityFeatureId is set).
 * These tests have customer-level products with items allocated per entity.
 *
 * NEW BEHAVIOR: granted_balance does NOT change when only current_balance is passed.
 * Instead, usage = granted_balance - current_balance.
 */

// =============================================================================
// Test: update-balance-per-entity1 - customer level update on per-entity balance
// =============================================================================
test.concurrent(`${chalk.yellowBright("update-balance-per-entity1: customer level update on per-entity balance")}`, async () => {
	const messagesItem = items.monthlyMessages({
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
	});
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { customerId, autumnV2, entities } = await initScenario({
		customerId: "update-per-entity1",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [freeProd] }),
			s.entities({ count: 3, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Initialize caches
	await autumnV2.customers.get(customerId);
	for (const entity of entities) {
		await autumnV2.entities.get(customerId, entity.id);
	}

	// Initial: customer has 300 (100 per entity × 3)
	const customer0 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer0.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 300,
		usage: 0,
		purchased_balance: 0,
	});

	// Each entity has 100
	for (const entity of entities) {
		const fetchedEntity = (await autumnV2.entities.get(
			customerId,
			entity.id,
		)) as ApiEntityV1;
		expect(fetchedEntity.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 100,
			current_balance: 100,
			usage: 0,
			purchased_balance: 0,
		});
	}

	// Update 1: customer balance from 300 to 240 (sequential deduction)
	// NEW: granted stays 300, usage becomes 60
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 240,
	});

	const customer1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer1.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300, // Unchanged
		current_balance: 240,
		usage: 60, // 300 - 240
		purchased_balance: 0,
	});

	// Sequential deduction: 60 deducted from first entity
	// Entity 1: granted 100, current 40, usage 60
	const entity1After1 = (await autumnV2.entities.get(
		customerId,
		entities[0].id,
	)) as ApiEntityV1;
	expect(entity1After1.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 100, // Unchanged
		current_balance: 40,
		usage: 60, // 100 - 40
		purchased_balance: 0,
	});

	// Entity 2 & 3 unchanged
	const entity2After1 = (await autumnV2.entities.get(
		customerId,
		entities[1].id,
	)) as ApiEntityV1;
	expect(entity2After1.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 100,
		usage: 0,
		purchased_balance: 0,
	});

	const entity3After1 = (await autumnV2.entities.get(
		customerId,
		entities[2].id,
	)) as ApiEntityV1;
	expect(entity3After1.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 100,
		usage: 0,
		purchased_balance: 0,
	});

	// Update 2: customer balance from 240 to 150 (sequential deduction from 40, 100, 100)
	// Deduct 90 more: first entity 40→0 (40 deducted), second entity 100→50 (50 deducted)
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 150,
	});

	const customer2 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer2.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300, // Unchanged
		current_balance: 150,
		usage: 150, // 300 - 150
	});

	// Entity 1: 0
	const entity1After2 = (await autumnV2.entities.get(
		customerId,
		entities[0].id,
	)) as ApiEntityV1;
	expect(entity1After2.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 100, // Unchanged
		current_balance: 0,
		usage: 100, // 100 - 0
	});

	// Entity 2: 50
	const entity2After2 = (await autumnV2.entities.get(
		customerId,
		entities[1].id,
	)) as ApiEntityV1;
	expect(entity2After2.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 100, // Unchanged
		current_balance: 50,
		usage: 50, // 100 - 50
	});

	// Entity 3: unchanged
	const entity3After2 = (await autumnV2.entities.get(
		customerId,
		entities[2].id,
	)) as ApiEntityV1;
	expect(entity3After2.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 100,
		usage: 0,
	});

	// Update 3: increase customer balance from 150 to 280 (sequential addition)
	// NEW: granted stays 300, usage becomes 20
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 280,
	});

	const customer3 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer3.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300, // Unchanged
		current_balance: 280,
		usage: 20, // 300 - 280
	});

	// Verify DB sync
	const customerFromDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 280,
		usage: 20,
		purchased_balance: 0,
	});
});

// =============================================================================
// Test: update-balance-per-entity2 - update specific entity balance
// =============================================================================
test.concurrent(`${chalk.yellowBright("update-balance-per-entity2: update specific entity balance")}`, async () => {
	const messagesItem = items.monthlyMessages({
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
	});
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { customerId, autumnV2, entities } = await initScenario({
		customerId: "update-per-entity2",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [freeProd] }),
			s.entities({ count: 3, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Initialize caches
	await autumnV2.customers.get(customerId);
	for (const entity of entities) {
		await autumnV2.entities.get(customerId, entity.id);
	}

	// Initial: 300 total, each entity 100
	const customer0 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer0.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 300,
		usage: 0,
	});

	// Update 1: first entity balance from 100 to 70
	// NEW: granted stays 100, current 70, usage 30
	await autumnV2.balances.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		current_balance: 70,
	});

	const entity1After1 = (await autumnV2.entities.get(
		customerId,
		entities[0].id,
	)) as ApiEntityV1;
	expect(entity1After1.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 100, // Unchanged
		current_balance: 70,
		usage: 30, // 100 - 70
	});

	// Other entities unchanged
	const entity2After1 = (await autumnV2.entities.get(
		customerId,
		entities[1].id,
	)) as ApiEntityV1;
	const entity3After1 = (await autumnV2.entities.get(
		customerId,
		entities[2].id,
	)) as ApiEntityV1;
	expect(entity2After1.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 100,
		usage: 0,
	});
	expect(entity3After1.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 100,
		usage: 0,
	});

	// Customer balance: granted 300, current 270 (70 + 100 + 100)
	const customer1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer1.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300, // Unchanged
		current_balance: 270,
		usage: 30, // 300 - 270
	});

	// Update 2: second entity balance from 100 to 120 (increase)
	// NEW: granted stays 100, current 120, usage -20 (credit)
	await autumnV2.balances.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		feature_id: TestFeature.Messages,
		current_balance: 120,
	});

	const entity2After2 = (await autumnV2.entities.get(
		customerId,
		entities[1].id,
	)) as ApiEntityV1;
	expect(entity2After2.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 100, // Unchanged
		current_balance: 120,
		usage: -20, // 100 - 120 = -20 (credit)
	});

	// Customer balance: granted 300, current 290 (70 + 120 + 100)
	const customer2 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer2.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300, // Unchanged
		current_balance: 290,
		usage: 10, // 30 from E1 - 20 from E2 = 10
	});

	// Update 3: third entity balance from 100 to 50
	// NEW: granted stays 100, current 50, usage 50
	await autumnV2.balances.update({
		customer_id: customerId,
		entity_id: entities[2].id,
		feature_id: TestFeature.Messages,
		current_balance: 50,
	});

	const entity3After3 = (await autumnV2.entities.get(
		customerId,
		entities[2].id,
	)) as ApiEntityV1;
	expect(entity3After3.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 100, // Unchanged
		current_balance: 50,
		usage: 50, // 100 - 50
	});

	// Customer balance: granted 300, current 240 (70 + 120 + 50)
	const customer3 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer3.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300, // Unchanged
		current_balance: 240,
		usage: 60, // 30 - 20 + 50 = 60
	});

	// Track usage on entity 1 to verify behavior
	await autumnV2.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 20,
	});

	const entity1AfterTrack = (await autumnV2.entities.get(
		customerId,
		entities[0].id,
	)) as ApiEntityV1;
	expect(entity1AfterTrack.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 100, // Unchanged
		current_balance: 50, // 70 - 20
		usage: 50, // 100 - 50
	});

	const customerAfterTrack =
		await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customerAfterTrack.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 220, // 50 + 120 + 50
		usage: 80, // 300 - 220
	});

	await timeout(4000);

	// Verify DB sync
	const customerFromDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 220,
		usage: 80,
	});
});

// =============================================================================
// Test: update-balance-per-entity3 - entity with multiple intervals (breakdown)
// =============================================================================
test.concurrent(`${chalk.yellowBright("update-balance-per-entity3: entity with multiple intervals (breakdown)")}`, async () => {
	const monthlyItem = items.monthlyMessages({
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
	});
	// Use constructFeatureItem for lifetime with entityFeatureId since items.lifetimeMessages doesn't support it
	const lifetimeItemWithEntity = constructFeatureItem({
		featureId: TestFeature.Messages,
		includedUsage: 50,
		interval: null,
		entityFeatureId: TestFeature.Users,
	});

	const freeProd = products.base({
		id: "free",
		items: [monthlyItem, lifetimeItemWithEntity],
	});

	const { customerId, autumnV2, entities } = await initScenario({
		customerId: "update-per-entity3",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [freeProd] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Initialize caches
	await autumnV2.customers.get(customerId);
	for (const entity of entities) {
		await autumnV2.entities.get(customerId, entity.id);
	}

	// Initial: customer has 300 (150 per entity × 2 = 300)
	const customer0 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer0.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 300,
		usage: 0,
	});

	// Each entity has 150 (100 monthly + 50 lifetime)
	for (const entity of entities) {
		const fetchedEntity = (await autumnV2.entities.get(
			customerId,
			entity.id,
		)) as ApiEntityV1;
		expect(fetchedEntity.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 150,
			current_balance: 150,
			usage: 0,
		});
	}

	// Check breakdown for entity shows 2 items
	const checkEntity0 = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
	});
	expect(checkEntity0.balance?.breakdown).toHaveLength(2);

	const monthlyBreakdown0 = checkEntity0.balance?.breakdown?.find(
		(b) => b.reset?.interval === ResetInterval.Month,
	);
	const lifetimeBreakdown0 = checkEntity0.balance?.breakdown?.find(
		(b) => b.reset?.interval === ResetInterval.OneOff,
	);
	expect(monthlyBreakdown0).toMatchObject({
		granted_balance: 100,
		current_balance: 100,
		usage: 0,
	});
	expect(lifetimeBreakdown0).toMatchObject({
		granted_balance: 50,
		current_balance: 50,
		usage: 0,
	});

	// Update 1: first entity balance from 150 to 120
	// NEW: granted stays 150, current 120, usage 30
	await autumnV2.balances.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		current_balance: 120,
	});

	const entity1After1 = (await autumnV2.entities.get(
		customerId,
		entities[0].id,
	)) as ApiEntityV1;
	expect(entity1After1.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 150, // Unchanged
		current_balance: 120,
		usage: 30, // 150 - 120
	});

	// Check breakdown is proportionally updated
	const checkEntity1 = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
	});

	const monthlyBreakdown1 = checkEntity1.balance?.breakdown?.find(
		(b) => b.reset?.interval === ResetInterval.Month,
	);
	const lifetimeBreakdown1 = checkEntity1.balance?.breakdown?.find(
		(b) => b.reset?.interval === ResetInterval.OneOff,
	);

	// Deduction of 30 is sequential from first breakdown (monthly)
	expect(monthlyBreakdown1).toMatchObject({
		granted_balance: 100, // Unchanged
		current_balance: 70,
		usage: 30, // 100 - 70
	});
	expect(lifetimeBreakdown1).toMatchObject({
		granted_balance: 50,
		current_balance: 50,
		usage: 0,
	});

	// Customer balance: granted 300, current 270 (120 + 150)
	const customer1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer1.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300, // Unchanged
		current_balance: 270,
		usage: 30, // 300 - 270
	});

	// Track 60 on entity 1 (currently has 120)
	await autumnV2.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 60,
	});

	const entity1AfterTrack = (await autumnV2.entities.get(
		customerId,
		entities[0].id,
	)) as ApiEntityV1;
	expect(entity1AfterTrack.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 150, // Unchanged
		current_balance: 60, // 120 - 60
		usage: 90, // 150 - 60
	});

	// Check breakdown - should deduct from monthly first
	const checkEntity2 = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
	});

	const monthlyBreakdown2 = checkEntity2.balance?.breakdown?.find(
		(b) => b.reset?.interval === ResetInterval.Month,
	);
	const lifetimeBreakdown2 = checkEntity2.balance?.breakdown?.find(
		(b) => b.reset?.interval === ResetInterval.OneOff,
	);

	// Monthly was 70, track 60 → 10
	expect(monthlyBreakdown2).toMatchObject({
		granted_balance: 100, // Unchanged
		current_balance: 10, // 70 - 60
		usage: 90, // 100 - 10
	});
	expect(lifetimeBreakdown2).toMatchObject({
		granted_balance: 50,
		current_balance: 50,
		usage: 0,
	});

	// Update 2: entity balance after usage to 180
	// NEW: granted stays 150, current 180, usage -30 (credit)
	await autumnV2.balances.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		current_balance: 180,
	});

	const entity1After2 = (await autumnV2.entities.get(
		customerId,
		entities[0].id,
	)) as ApiEntityV1;
	expect(entity1After2.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 150, // Unchanged
		current_balance: 180,
		usage: -30, // 150 - 180 = -30 (credit)
	});

	// Customer balance: granted 300, current 330 (180 + 150)
	const customer2 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer2.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300, // Unchanged
		current_balance: 330,
		usage: -30, // 300 - 330 = -30 (credit)
	});

	// Verify DB sync
	const customerFromDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 330,
		usage: -30,
	});
});

// =============================================================================
// Test: update-balance-per-entity4 - arrear entity items (overage allowed)
// =============================================================================
test.concurrent(`${chalk.yellowBright("update-balance-per-entity4: arrear entity items (overage allowed)")}`, async () => {
	const arrearItem = items.consumableMessages({
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
		price: 0.1,
	});
	const freeProd = products.base({ id: "free", items: [arrearItem] });

	const { customerId, autumnV2, entities } = await initScenario({
		customerId: "update-per-entity4",
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [freeProd] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Initialize caches
	await autumnV2.customers.get(customerId);
	for (const entity of entities) {
		await autumnV2.entities.get(customerId, entity.id);
	}

	// Initial: customer has 200 (100 per entity × 2)
	const customer0 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer0.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 200,
		current_balance: 200,
		usage: 0,
	});

	// Check overage_allowed=true
	const checkEntity0 = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
	});
	expect(checkEntity0.balance?.overage_allowed).toBe(true);

	// Update 1: first entity balance to negative (-50)
	// Arrear items: current floors at 0, overage goes to purchased_balance
	// NEW: granted stays 100, current 0, purchased 50, usage 150
	await autumnV2.balances.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		current_balance: -50,
	});

	const entity1After1 = (await autumnV2.entities.get(
		customerId,
		entities[0].id,
	)) as ApiEntityV1;
	expect(entity1After1.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 100, // Unchanged
		current_balance: 0, // Floored at 0
		purchased_balance: 50, // Overage absorbed
		usage: 150, // 100 + 50 = 150
	});

	// Entity 2 unchanged
	const entity2After1 = (await autumnV2.entities.get(
		customerId,
		entities[1].id,
	)) as ApiEntityV1;
	expect(entity2After1.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 100,
		purchased_balance: 0,
		usage: 0,
	});

	// Customer balance: granted 200, current 100 (0 + 100), purchased 50
	const customer1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer1.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 200, // Unchanged
		current_balance: 100,
		purchased_balance: 50,
		usage: 150, // 200 - 100 + 50 purchased
	});

	// Verify DB sync
	const customerFromDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 200,
		current_balance: 100,
		purchased_balance: 50,
	});
});
