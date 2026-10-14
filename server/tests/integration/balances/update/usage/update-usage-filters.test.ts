import { expect, test } from "bun:test";
import type { ApiCustomer, ApiEntityV1 } from "@autumn/shared";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

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

	const initial = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(initial.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 250,
		current_balance: 250,
		usage: 0,
	});

	const breakdowns = initial.balances[TestFeature.Messages].breakdown!;
	expect(breakdowns.length).toBe(2);

	const breakdownA = breakdowns.find((b) => b.granted_balance === 100)!;
	const breakdownB = breakdowns.find((b) => b.granted_balance === 150)!;
	expect(breakdownA).toBeDefined();
	expect(breakdownB).toBeDefined();

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		customer_entitlement_id: breakdownA.id,
		usage: 40,
	});

	const after1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(after1.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 250,
		current_balance: 210,
		usage: 40,
	});

	const breakdownAAfter = after1.balances[TestFeature.Messages].breakdown!.find(
		(b) => b.id === breakdownA.id,
	)!;
	expect(breakdownAAfter.current_balance).toBe(60);
	expect(breakdownAAfter.usage).toBe(40);

	const breakdownBAfter = after1.balances[TestFeature.Messages].breakdown!.find(
		(b) => b.id === breakdownB.id,
	)!;
	expect(breakdownBAfter.current_balance).toBe(150);
	expect(breakdownBAfter.usage).toBe(0);

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		customer_entitlement_id: breakdownB.id,
		usage: 100,
	});

	const after2 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(after2.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 250,
		current_balance: 110,
		usage: 140,
	});

	const afterDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(afterDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 250,
		current_balance: 110,
		usage: 140,
	});
});

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

	const initial = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(initial.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 300,
		usage: 0,
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		interval: ResetInterval.Month,
		usage: 60,
	});

	const after1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(after1.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 240,
		usage: 60,
	});

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

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		interval: ResetInterval.OneOff,
		usage: 80,
	});

	const after2 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(after2.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 160,
		usage: 140,
	});

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

	const afterDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(afterDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 160,
		usage: 140,
	});
});

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

	await autumnV2.customers.get<ApiCustomer>(customerId);
	for (const entity of entities) {
		await autumnV2.entities.get<ApiEntityV1>(customerId, entity.id);
	}

	const initial = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(initial.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 300,
		usage: 0,
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		entity_id: entities[0].id,
		interval: ResetInterval.Month,
		usage: 30,
	});

	const entity1After = await autumnV2.entities.get<ApiEntityV1>(
		customerId,
		entities[0].id,
	);
	expect(entity1After.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 150,
		current_balance: 120,
		usage: 30,
	});

	const entity2After = await autumnV2.entities.get<ApiEntityV1>(
		customerId,
		entities[1].id,
	);
	expect(entity2After.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 150,
		current_balance: 150,
		usage: 0,
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		entity_id: entities[1].id,
		interval: ResetInterval.OneOff,
		usage: 20,
	});

	const entity2After2 = await autumnV2.entities.get<ApiEntityV1>(
		customerId,
		entities[1].id,
	);
	expect(entity2After2.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 150,
		current_balance: 130,
		usage: 20,
	});

	const customerAfter = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customerAfter.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 250,
		usage: 50,
	});

	const customerDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 250,
		usage: 50,
	});
});
