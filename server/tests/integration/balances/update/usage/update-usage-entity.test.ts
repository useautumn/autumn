import { expect, test } from "bun:test";
import type { ApiCustomer, ApiEntityV1 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("update-usage-entity1: customer-level usage update on per-entity balance")}`,
	async () => {
		const messagesItem = items.monthlyMessages({
			includedUsage: 100,
			entityFeatureId: TestFeature.Users,
		});
		const freeProd = products.base({ id: "free", items: [messagesItem] });

		const { customerId, autumnV2, entities } = await initScenario({
			customerId: "update-usage-entity1",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
				s.entities({ count: 3, featureId: TestFeature.Users }),
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
			usage: 150,
		});

		const after1 = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(after1.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 300,
			current_balance: 150,
			usage: 150,
		});

		const entity1 = await autumnV2.entities.get<ApiEntityV1>(
			customerId,
			entities[0].id,
		);
		expect(entity1.balances?.[TestFeature.Messages]?.current_balance).toBe(0);
		expect(entity1.balances?.[TestFeature.Messages]?.usage).toBe(100);

		const entity2 = await autumnV2.entities.get<ApiEntityV1>(
			customerId,
			entities[1].id,
		);
		expect(entity2.balances?.[TestFeature.Messages]?.current_balance).toBe(50);
		expect(entity2.balances?.[TestFeature.Messages]?.usage).toBe(50);

		const entity3 = await autumnV2.entities.get<ApiEntityV1>(
			customerId,
			entities[2].id,
		);
		expect(entity3.balances?.[TestFeature.Messages]?.current_balance).toBe(100);
		expect(entity3.balances?.[TestFeature.Messages]?.usage).toBe(0);

		const afterDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
			skip_cache: "true",
		});
		expect(afterDb.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 300,
			current_balance: 150,
			usage: 150,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("update-usage-entity2: set usage on individual entity")}`,
	async () => {
		const messagesItem = items.monthlyMessages({
			includedUsage: 100,
			entityFeatureId: TestFeature.Users,
		});
		const freeProd = products.base({ id: "free", items: [messagesItem] });

		const { customerId, autumnV2, entities } = await initScenario({
			customerId: "update-usage-entity2",
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
			usage: 60,
		});

		const entity1After = await autumnV2.entities.get<ApiEntityV1>(
			customerId,
			entities[0].id,
		);
		expect(entity1After.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 100,
			current_balance: 40,
			usage: 60,
		});

		const entity2After = await autumnV2.entities.get<ApiEntityV1>(
			customerId,
			entities[1].id,
		);
		expect(entity2After.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 100,
			current_balance: 100,
			usage: 0,
		});

		const customerAfter = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customerAfter.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 200,
			current_balance: 140,
			usage: 60,
		});

		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entities[1].id,
			usage: 30,
		});

		const entity2After2 = await autumnV2.entities.get<ApiEntityV1>(
			customerId,
			entities[1].id,
		);
		expect(entity2After2.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 100,
			current_balance: 70,
			usage: 30,
		});

		const customerAfter2 =
			await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customerAfter2.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 200,
			current_balance: 110,
			usage: 90,
		});

		const customerDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
			skip_cache: "true",
		});
		expect(customerDb.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 200,
			current_balance: 110,
			usage: 90,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("update-usage-entity3: usage on entity-attached products")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const freeProd = products.base({ id: "free", items: [messagesItem] });

		const { customerId, autumnV2, entities } = await initScenario({
			customerId: "update-usage-entity3",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: freeProd.id, entityIndex: 0 }),
				s.attach({ productId: freeProd.id, entityIndex: 1 }),
			],
		});

		for (const entity of entities) {
			await autumnV2.entities.get<ApiEntityV1>(customerId, entity.id);
		}

		const entity1Init = await autumnV2.entities.get<ApiEntityV1>(
			customerId,
			entities[0].id,
		);
		expect(entity1Init.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 100,
			current_balance: 100,
			usage: 0,
		});

		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entities[0].id,
			usage: 70,
		});

		const entity1After = await autumnV2.entities.get<ApiEntityV1>(
			customerId,
			entities[0].id,
		);
		expect(entity1After.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 100,
			current_balance: 30,
			usage: 70,
		});

		const entity2After = await autumnV2.entities.get<ApiEntityV1>(
			customerId,
			entities[1].id,
		);
		expect(entity2After.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 100,
			current_balance: 100,
			usage: 0,
		});

		if (!isBalanceWorkerRoute()) {
			const customerAfter =
				await autumnV2.customers.get<ApiCustomer>(customerId);
			expect(customerAfter.balances[TestFeature.Messages]).toMatchObject({
				granted_balance: 200,
				current_balance: 130,
				usage: 70,
			});
		}

		const entity1Db = await autumnV2.entities.get<ApiEntityV1>(
			customerId,
			entities[0].id,
		);
		expect(entity1Db.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 100,
			current_balance: 30,
			usage: 70,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("update-usage-entity4: mixed customer and entity products")}`,
	async () => {
		const customerMessages = items.monthlyMessages({ includedUsage: 50 });
		const customerProd = products.base({
			id: "base-cust",
			items: [customerMessages],
		});

		const entityMessages = items.monthlyMessages({ includedUsage: 100 });
		const entityProd = products.base({
			id: "base-entity",
			items: [entityMessages],
		});

		const { customerId, autumnV2, entities } = await initScenario({
			customerId: "update-usage-entity4",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [customerProd, entityProd] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: customerProd.id }),
				s.attach({ productId: entityProd.id, entityIndex: 0 }),
				s.attach({ productId: entityProd.id, entityIndex: 1 }),
			],
		});

		await autumnV2.customers.get<ApiCustomer>(customerId);
		for (const entity of entities) {
			await autumnV2.entities.get<ApiEntityV1>(customerId, entity.id);
		}

		if (!isBalanceWorkerRoute()) {
			const initial = await autumnV2.customers.get<ApiCustomer>(customerId);
			expect(initial.balances[TestFeature.Messages]).toMatchObject({
				granted_balance: 250,
				current_balance: 250,
				usage: 0,
			});
		}

		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entities[0].id,
			usage: 80,
		});

		const entity1After = await autumnV2.entities.get<ApiEntityV1>(
			customerId,
			entities[0].id,
		);
		expect(entity1After.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 150,
			current_balance: 70,
			usage: 80,
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

		if (isBalanceWorkerRoute()) {
			const entity1Db = await autumnV2.entities.get<ApiEntityV1>(
				customerId,
				entities[0].id,
				{ skip_cache: "true" },
			);
			expect(entity1Db.balances?.[TestFeature.Messages]).toMatchObject({
				granted_balance: 150,
				current_balance: 70,
				usage: 80,
			});
		} else {
			const customerDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
				skip_cache: "true",
			});
			expect(customerDb.balances[TestFeature.Messages]).toMatchObject({
				granted_balance: 250,
				current_balance: 170,
				usage: 80,
			});
		}
	},
);
