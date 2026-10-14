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

	await autumnV2.customers.get(customerId);
	for (const entity of entities) {
		await autumnV2.entities.get(customerId, entity.id);
	}

	const customer0 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer0.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 300,
		usage: 0,
		purchased_balance: 0,
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
			purchased_balance: 0,
		});
	}

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 240,
	});

	const customer1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer1.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 240,
		usage: 60,
		purchased_balance: 0,
	});

	const entity1After1 = (await autumnV2.entities.get(
		customerId,
		entities[0].id,
	)) as ApiEntityV1;
	expect(entity1After1.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 40,
		usage: 60,
		purchased_balance: 0,
	});

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

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 150,
	});

	const customer2 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer2.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 150,
		usage: 150,
	});

	const entity1After2 = (await autumnV2.entities.get(
		customerId,
		entities[0].id,
	)) as ApiEntityV1;
	expect(entity1After2.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 0,
		usage: 100,
	});

	const entity2After2 = (await autumnV2.entities.get(
		customerId,
		entities[1].id,
	)) as ApiEntityV1;
	expect(entity2After2.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 50,
		usage: 50,
	});

	const entity3After2 = (await autumnV2.entities.get(
		customerId,
		entities[2].id,
	)) as ApiEntityV1;
	expect(entity3After2.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 100,
		usage: 0,
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 280,
	});

	const customer3 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer3.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 280,
		usage: 20,
	});

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

	await autumnV2.customers.get(customerId);
	for (const entity of entities) {
		await autumnV2.entities.get(customerId, entity.id);
	}

	const customer0 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer0.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 300,
		usage: 0,
	});

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
		granted_balance: 100,
		current_balance: 70,
		usage: 30,
	});

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

	const customer1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer1.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 270,
		usage: 30,
	});

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
		granted_balance: 100,
		current_balance: 120,
		usage: -20,
	});

	const customer2 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer2.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 290,
		usage: 10,
	});

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
		granted_balance: 100,
		current_balance: 50,
		usage: 50,
	});

	const customer3 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer3.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 240,
		usage: 60,
	});

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
		granted_balance: 100,
		current_balance: 50,
		usage: 50,
	});

	const customerAfterTrack =
		await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customerAfterTrack.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 220,
		usage: 80,
	});

	await timeout(4000);

	const customerFromDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 220,
		usage: 80,
	});
});

test.concurrent(`${chalk.yellowBright("update-balance-per-entity3: entity with multiple intervals (breakdown)")}`, async () => {
	const monthlyItem = items.monthlyMessages({
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
	});
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

	await autumnV2.customers.get(customerId);
	for (const entity of entities) {
		await autumnV2.entities.get(customerId, entity.id);
	}

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
			granted_balance: 150,
			current_balance: 150,
			usage: 0,
		});
	}

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
		granted_balance: 150,
		current_balance: 120,
		usage: 30,
	});

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

	expect(monthlyBreakdown1).toMatchObject({
		granted_balance: 100,
		current_balance: 70,
		usage: 30,
	});
	expect(lifetimeBreakdown1).toMatchObject({
		granted_balance: 50,
		current_balance: 50,
		usage: 0,
	});

	const customer1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer1.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 270,
		usage: 30,
	});

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
		granted_balance: 150,
		current_balance: 60,
		usage: 90,
	});

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

	expect(monthlyBreakdown2).toMatchObject({
		granted_balance: 100,
		current_balance: 10,
		usage: 90,
	});
	expect(lifetimeBreakdown2).toMatchObject({
		granted_balance: 50,
		current_balance: 50,
		usage: 0,
	});

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
		granted_balance: 150,
		current_balance: 180,
		usage: -30,
	});

	const customer2 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer2.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 330,
		usage: -30,
	});

	const customerFromDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 330,
		usage: -30,
	});
});

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

	await autumnV2.customers.get(customerId);
	for (const entity of entities) {
		await autumnV2.entities.get(customerId, entity.id);
	}

	const customer0 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer0.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 200,
		current_balance: 200,
		usage: 0,
	});

	const checkEntity0 = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
	});
	expect(checkEntity0.balance?.overage_allowed).toBe(true);

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
		granted_balance: 100,
		current_balance: 0,
		purchased_balance: 50,
		usage: 150,
	});

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

	const customer1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer1.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 200,
		current_balance: 100,
		purchased_balance: 50,
		usage: 150,
	});

	const customerFromDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 200,
		current_balance: 100,
		purchased_balance: 50,
	});
});
