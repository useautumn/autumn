import { expect, test } from "bun:test";
import type { ApiCustomer, ApiEntityV1 } from "@autumn/shared";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/**
 * Tests for updating granted_balance (included usage).
 * When granted_balance is explicitly passed, it DOES change the included amount.
 * This is different from updating only current_balance (which leaves granted_balance unchanged).
 */

// =============================================================================
// Test: update-included1 - basic update granted_balance
// =============================================================================
test.concurrent(`${chalk.yellowBright("update-included1: basic update granted_balance")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-included1",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Update granted_balance to 150, current_balance to 100
	// This should result in usage = 50
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 100,
		granted_balance: 150,
	});

	const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 150,
		current_balance: 100,
		usage: 50,
		purchased_balance: 0,
	});

	// Verify DB sync
	const customerFromDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 150,
		current_balance: 100,
		usage: 50,
		purchased_balance: 0,
	});
});

// =============================================================================
// Test: update-included2 - update granted_balance with breakdown (interval filter)
// =============================================================================
test.concurrent(`${chalk.yellowBright("update-included2: update granted_balance with breakdown")}`, async () => {
	const monthlyItem = items.monthlyMessages({ includedUsage: 100 });
	const lifetimeItem = items.lifetimeMessages({ includedUsage: 50 });
	const freeProd = products.base({
		id: "free",
		items: [monthlyItem, lifetimeItem],
	});

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-included2",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Update granted_balance to 75 for monthly feature only
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 50,
		granted_balance: 75,
		interval: ResetInterval.Month,
	});

	const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
	const balance = customer.balances[TestFeature.Messages];

	// Monthly breakdown should be updated
	const monthlyBreakdown = balance.breakdown?.find(
		(b) => b.reset?.interval === ResetInterval.Month,
	);
	expect(monthlyBreakdown).toMatchObject({
		granted_balance: 75,
		current_balance: 50,
		usage: 25,
		purchased_balance: 0,
	});

	// Lifetime breakdown should be unchanged
	const lifetimeBreakdown = balance.breakdown?.find(
		(b) => b.reset?.interval === ResetInterval.OneOff,
	);
	expect(lifetimeBreakdown).toMatchObject({
		granted_balance: 50,
		current_balance: 50,
		usage: 0,
		purchased_balance: 0,
	});

	// Total balance
	expect(balance).toMatchObject({
		granted_balance: 125, // 75 + 50
		current_balance: 100, // 50 + 50
		usage: 25,
		purchased_balance: 0,
	});
});

// =============================================================================
// Test: update-included3 - update granted_balance on entity balances
// =============================================================================
test.concurrent(`${chalk.yellowBright("update-included3: update granted_balance on entity balances")}`, async () => {
	const messagesItem = items.monthlyMessages({
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
	});
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { customerId, autumnV2, entities } = await initScenario({
		customerId: "update-included3",
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

	// Update granted_balance to 75 for entity 1
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		entity_id: entities[0].id,
		current_balance: 50,
		granted_balance: 75,
		interval: ResetInterval.Month,
	});

	// Entity 1 should be updated
	const entity1 = await autumnV2.entities.get<ApiEntityV1>(
		customerId,
		entities[0].id,
	);
	expect(entity1.balances![TestFeature.Messages]).toMatchObject({
		granted_balance: 75,
		current_balance: 50,
		usage: 25,
		purchased_balance: 0,
	});

	// Entity 2 should be unchanged
	const entity2 = await autumnV2.entities.get<ApiEntityV1>(
		customerId,
		entities[1].id,
	);
	expect(entity2.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 100,
		usage: 0,
		purchased_balance: 0,
	});

	// Update entity 2 granted_balance to 50
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		entity_id: entities[1].id,
		current_balance: 25,
		granted_balance: 50,
	});

	// Entity 2 should be updated
	const entity2After = await autumnV2.entities.get<ApiEntityV1>(
		customerId,
		entities[1].id,
	);
	expect(entity2After.balances![TestFeature.Messages]).toMatchObject({
		granted_balance: 50,
		current_balance: 25,
		usage: 25,
		purchased_balance: 0,
	});

	// Entity 1 should still be unchanged from earlier
	const entity1After = await autumnV2.entities.get<ApiEntityV1>(
		customerId,
		entities[0].id,
	);
	expect(entity1After.balances![TestFeature.Messages]).toMatchObject({
		granted_balance: 75,
		current_balance: 50,
		usage: 25,
		purchased_balance: 0,
	});
});

// =============================================================================
// Test: update-included4 - update current_balance then update granted_balance
// =============================================================================
test.concurrent(`${chalk.yellowBright("update-included4: update current_balance then granted_balance")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-included4",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Step 1: Update only current_balance to 50
	// NEW BEHAVIOR: granted_balance stays 100, usage becomes 50
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 50,
	});

	const customer1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer1.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100, // Unchanged (new behavior)
		current_balance: 50,
		usage: 50, // 100 - 50
		purchased_balance: 0,
	});

	// Step 2: Now explicitly update granted_balance to 150
	// This should change granted_balance since we're passing it explicitly
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		granted_balance: 150,
		current_balance: 50,
	});

	const customer2 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer2.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 150, // Now changed because we passed it
		current_balance: 50,
		usage: 100, // 150 - 50
		purchased_balance: 0,
	});

	// Verify DB sync
	const customerFromDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 150,
		current_balance: 50,
		usage: 100,
		purchased_balance: 0,
	});
});
