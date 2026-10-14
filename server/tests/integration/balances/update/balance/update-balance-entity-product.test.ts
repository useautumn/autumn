import { expect, test } from "bun:test";
import type { ApiCustomer, ApiEntityV1 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("update-balance-entity-product1: entity products")}`,
	async () => {
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
				s.attach({ productId: entityProd.id, entityIndex: 0 }),
				s.attach({ productId: entityProd.id, entityIndex: 1 }),
				s.attach({ productId: entityProd.id, entityIndex: 2 }),
			],
		});

		await autumnV2.customers.get(customerId);
		for (const entity of entities) {
			await autumnV2.entities.get(customerId, entity.id);
		}

		if (!isBalanceWorkerRoute()) {
			const customer0 = await autumnV2.customers.get<ApiCustomer>(customerId);
			expect(customer0.balances[TestFeature.Messages]).toMatchObject({
				granted_balance: 300,
				current_balance: 300,
				usage: 0,
			});
		}

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
			granted_balance: 100,
			current_balance: 80,
			usage: 20,
		});

		const entity2After1 = await autumnV2.entities.get<ApiEntityV1>(
			customerId,
			entities[1].id,
		);
		expect(entity2After1.balances![TestFeature.Messages]).toMatchObject({
			granted_balance: 100,
			current_balance: 100,
			usage: 0,
		});

		if (!isBalanceWorkerRoute()) {
			const customer1 = await autumnV2.customers.get<ApiCustomer>(customerId);
			expect(customer1.balances[TestFeature.Messages]).toMatchObject({
				granted_balance: 300,
				current_balance: 280,
				usage: 20,
			});
		}

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
			granted_balance: 100,
			current_balance: 150,
			usage: -50,
		});

		if (!isBalanceWorkerRoute()) {
			const customer2 = await autumnV2.customers.get<ApiCustomer>(customerId);
			expect(customer2.balances[TestFeature.Messages]).toMatchObject({
				granted_balance: 300,
				current_balance: 330,
				usage: -30,
			});
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("update-balance-entity-product2: mixed customer and entity products")}`,
	async () => {
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
				s.attach({ productId: customerProd.id }),
				s.attach({ productId: entityProd.id, entityIndex: 0 }),
				s.attach({ productId: entityProd.id, entityIndex: 1 }),
				s.attach({ productId: entityProd.id, entityIndex: 2 }),
			],
		});

		await autumnV2.customers.get(customerId);
		for (const entity of entities) {
			await autumnV2.entities.get(customerId, entity.id);
		}

		if (!isBalanceWorkerRoute()) {
			const customer0 = await autumnV2.customers.get<ApiCustomer>(customerId);
			expect(customer0.balances[TestFeature.Messages]).toMatchObject({
				granted_balance: 350,
				current_balance: 350,
				usage: 0,
			});
		}

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
			granted_balance: 150,
			current_balance: 100,
			usage: 50,
		});

		if (!isBalanceWorkerRoute()) {
			const customer1 = await autumnV2.customers.get<ApiCustomer>(customerId);
			expect(customer1.balances[TestFeature.Messages]).toMatchObject({
				granted_balance: 350,
				current_balance: 300,
				usage: 50,
			});
		}

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
			granted_balance: 150,
			current_balance: 200,
			usage: -50,
		});

		if (!isBalanceWorkerRoute()) {
			const customer2 = await autumnV2.customers.get<ApiCustomer>(customerId);
			expect(customer2.balances[TestFeature.Messages]).toMatchObject({
				granted_balance: 350,
				current_balance: 350,
				usage: 0,
			});
		}
	},
);
