import { expect, test } from "bun:test";
import type { ApiCustomer, ApiEntityV1 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// UPDATE-USAGE-ADJ1: Customer-level — update granted_balance then set usage
// Verifies adjustment (granted_balance - allowance) is included in usage formula
// Formula: targetBalance = (allowance + adjustment) + prepaid - usage
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-usage-adj1: adjustment considered in usage calculation")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-usage-adj1",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Initial: allowance=100, adjustment=0, granted=100, current=100
	const initial = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(initial.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 100,
		usage: 0,
	});

	// Update granted_balance to 150 (creates adjustment of +50)
	// Must also pass current_balance
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		granted_balance: 150,
		current_balance: 150,
	});

	const afterGrant = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(afterGrant.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 150,
		current_balance: 150,
		usage: 0,
	});

	// Now set usage to 120: targetBalance = (100 + 50) + 0 - 120 = 30
	// The +50 adjustment must be included for this to be correct
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		usage: 120,
	});

	const afterUsage = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(afterUsage.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 150,
		current_balance: 30,
		usage: 120,
	});

	// Verify DB sync
	const afterUsageDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(afterUsageDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 150,
		current_balance: 30,
		usage: 120,
	});
});

// ═══════════════════════════════════════════════════════════════════
// UPDATE-USAGE-ADJ2: Per-entity — update granted_balance then set usage
// entityFeatureId on item, product attached at customer level
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-usage-adj2: per-entity adjustment in usage calculation")}`, async () => {
	const messagesItem = items.monthlyMessages({
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
	});
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { customerId, autumnV2, entities } = await initScenario({
		customerId: "update-usage-adj2",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [freeProd] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Warm caches
	await autumnV2.customers.get<ApiCustomer>(customerId);
	for (const entity of entities) {
		await autumnV2.entities.get<ApiEntityV1>(customerId, entity.id);
	}

	// Each entity: allowance=100, granted=100
	// Update entity1's granted_balance to 160 (creates adjustment of +60)
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		entity_id: entities[0].id,
		granted_balance: 160,
		current_balance: 160,
	});

	const entity1AfterGrant = await autumnV2.entities.get<ApiEntityV1>(
		customerId,
		entities[0].id,
	);
	expect(entity1AfterGrant.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 160,
		current_balance: 160,
		usage: 0,
	});

	// Entity2 should be unchanged at 100
	const entity2AfterGrant = await autumnV2.entities.get<ApiEntityV1>(
		customerId,
		entities[1].id,
	);
	expect(entity2AfterGrant.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 100,
		usage: 0,
	});

	// Set usage=130 on entity1: targetBalance = (100 + 60) + 0 - 130 = 30
	// The +60 adjustment must be included
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		entity_id: entities[0].id,
		usage: 130,
	});

	const entity1AfterUsage = await autumnV2.entities.get<ApiEntityV1>(
		customerId,
		entities[0].id,
	);
	expect(entity1AfterUsage.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 160,
		current_balance: 30,
		usage: 130,
	});

	// Entity2 still unchanged
	const entity2AfterUsage = await autumnV2.entities.get<ApiEntityV1>(
		customerId,
		entities[1].id,
	);
	expect(entity2AfterUsage.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 100,
		usage: 0,
	});

	// Customer aggregate: 30 + 100 = 130
	const customerAfter = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customerAfter.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 260,
		current_balance: 130,
		usage: 130,
	});

	// Verify DB sync
	const customerDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 260,
		current_balance: 130,
		usage: 130,
	});
});
