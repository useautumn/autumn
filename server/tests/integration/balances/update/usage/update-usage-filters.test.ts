import { expect, test } from "bun:test";
import type { ApiCustomer, ApiEntityV1 } from "@autumn/shared";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// UPDATE-USAGE-FILTER1: Set usage with customer_entitlement_id filter
// Target specific breakdowns by their ID
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-usage-filter1: usage with customer_entitlement_id filter")}`, async () => {
	const prodA = products.base({
		id: "prod-a",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const prodB = products.base({
		id: "prod-b",
		isAddOn: true,
		items: [items.monthlyMessages({ includedUsage: 150 })],
	});

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-usage-filter1",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [prodA, prodB] }),
		],
		actions: [
			s.attach({ productId: prodA.id }),
			s.attach({ productId: prodB.id }),
		],
	});

	// Initial: granted=250, current=250, usage=0
	const initial = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(initial.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 250,
		current_balance: 250,
		usage: 0,
	});

	// Get customer_entitlement_ids from breakdowns
	const breakdowns = initial.balances[TestFeature.Messages].breakdown!;
	expect(breakdowns.length).toBe(2);

	const breakdownA = breakdowns.find((b) => b.granted_balance === 100)!;
	const breakdownB = breakdowns.find((b) => b.granted_balance === 150)!;
	expect(breakdownA).toBeDefined();
	expect(breakdownB).toBeDefined();

	// Set usage=40 on breakdown A: targetBalance = 100 + 0 - 40 = 60
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		customer_entitlement_id: breakdownA.id,
		usage: 40,
	});

	const after1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	// Aggregate: 60 + 150 = 210
	expect(after1.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 250,
		current_balance: 210,
		usage: 40,
	});

	// Verify breakdown A
	const breakdownAAfter = after1.balances[TestFeature.Messages].breakdown!.find(
		(b) => b.id === breakdownA.id,
	)!;
	expect(breakdownAAfter.current_balance).toBe(60);
	expect(breakdownAAfter.usage).toBe(40);

	// Verify breakdown B unchanged
	const breakdownBAfter = after1.balances[TestFeature.Messages].breakdown!.find(
		(b) => b.id === breakdownB.id,
	)!;
	expect(breakdownBAfter.current_balance).toBe(150);
	expect(breakdownBAfter.usage).toBe(0);

	// Set usage=100 on breakdown B: targetBalance = 150 + 0 - 100 = 50
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		customer_entitlement_id: breakdownB.id,
		usage: 100,
	});

	const after2 = await autumnV2.customers.get<ApiCustomer>(customerId);
	// Aggregate: 60 + 50 = 110
	expect(after2.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 250,
		current_balance: 110,
		usage: 140,
	});

	// Verify DB sync
	const afterDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(afterDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 250,
		current_balance: 110,
		usage: 140,
	});
});

// ═══════════════════════════════════════════════════════════════════
// UPDATE-USAGE-FILTER2: Set usage with interval filter
// Target breakdowns by reset interval (monthly vs lifetime)
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-usage-filter2: usage with interval filter")}`, async () => {
	const monthlyProd = products.base({
		id: "monthly-prod",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const lifetimeProd = products.base({
		id: "lifetime-prod",
		isAddOn: true,
		items: [items.lifetimeMessages({ includedUsage: 200 })],
	});

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-usage-filter2",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [monthlyProd, lifetimeProd] }),
		],
		actions: [
			s.attach({ productId: monthlyProd.id }),
			s.attach({ productId: lifetimeProd.id }),
		],
	});

	// Initial: 100 monthly + 200 lifetime = 300 total
	const initial = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(initial.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 300,
		usage: 0,
	});

	// Set usage=60 on monthly only: targetBalance = 100 + 0 - 60 = 40
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		interval: ResetInterval.Month,
		usage: 60,
	});

	const after1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	// Aggregate: 40 + 200 = 240
	expect(after1.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 240,
		usage: 60,
	});

	// Verify monthly breakdown updated, lifetime unchanged
	const breakdowns1 = after1.balances[TestFeature.Messages].breakdown!;
	const monthlyAfter1 = breakdowns1.find(
		(b) => b.reset?.interval === ResetInterval.Month,
	)!;
	expect(monthlyAfter1).toMatchObject({
		granted_balance: 100,
		current_balance: 40,
		usage: 60,
	});
	const lifetimeAfter1 = breakdowns1.find(
		(b) => b.reset?.interval === ResetInterval.OneOff,
	)!;
	expect(lifetimeAfter1).toMatchObject({
		granted_balance: 200,
		current_balance: 200,
		usage: 0,
	});

	// Set usage=80 on lifetime only: targetBalance = 200 + 0 - 80 = 120
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		interval: ResetInterval.OneOff,
		usage: 80,
	});

	const after2 = await autumnV2.customers.get<ApiCustomer>(customerId);
	// Aggregate: 40 + 120 = 160
	expect(after2.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 160,
		usage: 140,
	});

	// Verify lifetime breakdown updated, monthly still at 40
	const breakdowns2 = after2.balances[TestFeature.Messages].breakdown!;

	const monthlyAfter2 = breakdowns2.find(
		(b) => b.reset?.interval === ResetInterval.Month,
	)!;
	expect(monthlyAfter2).toMatchObject({
		granted_balance: 100,
		current_balance: 40,
		usage: 60,
	});
	const lifetimeAfter2 = breakdowns2.find(
		(b) => b.reset?.interval === ResetInterval.OneOff,
	)!;
	expect(lifetimeAfter2).toMatchObject({
		granted_balance: 200,
		current_balance: 120,
		usage: 80,
	});

	// Verify DB sync
	const afterDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(afterDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 160,
		usage: 140,
	});
});

// ═══════════════════════════════════════════════════════════════════
// UPDATE-USAGE-FILTER3: Entity + interval filter combination
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-usage-filter3: entity + interval filter combination")}`, async () => {
	const monthlyMessages = items.monthlyMessages({
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
	});
	const lifetimeMessages = items.lifetimeMessages({
		includedUsage: 50,
		entityFeatureId: TestFeature.Users,
	});
	const freeProd = products.base({
		id: "free",
		items: [monthlyMessages, lifetimeMessages],
	});

	const { customerId, autumnV2, entities } = await initScenario({
		customerId: "update-usage-filter3",
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

	// Each entity: 100 monthly + 50 lifetime = 150 per entity
	// Customer total: 2 * 150 = 300
	const initial = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(initial.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 300,
		usage: 0,
	});

	// Set usage=30 on entity1's monthly breakdown only
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		entity_id: entities[0].id,
		interval: ResetInterval.Month,
		usage: 30,
	});

	// Entity1: monthly=70, lifetime=50 → 120
	const entity1After = await autumnV2.entities.get<ApiEntityV1>(
		customerId,
		entities[0].id,
	);
	expect(entity1After.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 150,
		current_balance: 120,
		usage: 30,
	});

	// Entity2 unchanged: 150
	const entity2After = await autumnV2.entities.get<ApiEntityV1>(
		customerId,
		entities[1].id,
	);
	expect(entity2After.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 150,
		current_balance: 150,
		usage: 0,
	});

	// Set usage=20 on entity2's lifetime breakdown only
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		entity_id: entities[1].id,
		interval: ResetInterval.OneOff,
		usage: 20,
	});

	// Entity2: monthly=100, lifetime=30 → 130
	const entity2After2 = await autumnV2.entities.get<ApiEntityV1>(
		customerId,
		entities[1].id,
	);
	expect(entity2After2.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 150,
		current_balance: 130,
		usage: 20,
	});

	// Customer total: 120 + 130 = 250
	const customerAfter = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customerAfter.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 250,
		usage: 50,
	});

	// Verify DB sync
	const customerDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 250,
		usage: 50,
	});
});
