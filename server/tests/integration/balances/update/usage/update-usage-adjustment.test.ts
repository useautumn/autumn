import { expect, test } from "bun:test";
import type { ApiCustomer, ApiEntityV1 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("update-usage-adj1: adjustment considered in usage calculation")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-usage-adj1",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const initial = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(initial.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 100,
		usage: 0,
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		included_grant: 150,
		current_balance: 150,
	});

	const afterGrant = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(afterGrant.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 150,
		current_balance: 150,
		usage: 0,
	});

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

	const afterUsageDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(afterUsageDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 150,
		current_balance: 30,
		usage: 120,
	});
});

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

	await autumnV2.customers.get<ApiCustomer>(customerId);
	for (const entity of entities) {
		await autumnV2.entities.get<ApiEntityV1>(customerId, entity.id);
	}

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		entity_id: entities[0].id,
		included_grant: 160,
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

	const entity2AfterGrant = await autumnV2.entities.get<ApiEntityV1>(
		customerId,
		entities[1].id,
	);
	expect(entity2AfterGrant.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 100,
		usage: 0,
	});

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

	const entity2AfterUsage = await autumnV2.entities.get<ApiEntityV1>(
		customerId,
		entities[1].id,
	);
	expect(entity2AfterUsage.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 100,
		usage: 0,
	});

	const customerAfter = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customerAfter.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 260,
		current_balance: 130,
		usage: 130,
	});

	const customerDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 260,
		current_balance: 130,
		usage: 130,
	});
});
