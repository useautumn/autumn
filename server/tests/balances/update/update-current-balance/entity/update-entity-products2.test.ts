import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCustomer,
	type ApiEntityV1,
	ApiVersion,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const customerMessagesItem = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 50,
});

const entityMessagesItem = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
});

const customerProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [customerMessagesItem],
});

const entityProd = constructProduct({
	type: "free",
	id: "entity_prod",
	isDefault: false,
	items: [entityMessagesItem],
});

const testCase = "update-entity-products2";

describe(`${chalk.yellowBright("update-entity-products2: update with mixed customer and entity products")}`, () => {
	const customerId = testCase;
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

	const entities = [
		{
			id: `${testCase}-user-1`,
			name: "User 1",
			feature_id: TestFeature.Users,
		},
		{
			id: `${testCase}-user-2`,
			name: "User 2",
			feature_id: TestFeature.Users,
		},
		{
			id: `${testCase}-user-3`,
			name: "User 3",
			feature_id: TestFeature.Users,
		},
	];

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		await initProductsV0({
			ctx,
			products: [customerProd, entityProd],
			prefix: testCase,
		});

		await autumnV2.entities.create(customerId, entities);

		// Attach customer product
		await autumnV2.attach({
			customer_id: customerId,
			product_id: customerProd.id,
		});

		// Attach entity product to each entity
		for (const entity of entities) {
			await autumnV2.attach({
				customer_id: customerId,
				entity_id: entity.id,
				product_id: entityProd.id,
			});
		}

		// Initialize caches
		await autumnV2.customers.get(customerId);
		for (const entity of entities) {
			await autumnV2.entities.get(customerId, entity.id);
		}
	});

	test("initial state: customer should have 350 messages (50 + 3*100), each entity 150 (50 + 100)", async () => {
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
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
				granted_balance: 150,
				current_balance: 150,
				usage: 0,
			});
		}
	});

	test("update first entity balance from 150 to 100", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			current_balance: 100,
		});

		const entity1 = await autumnV2.entities.get<ApiCustomer>(
			customerId,
			entities[0].id,
		);
		expect(entity1.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 100,
			current_balance: 100,
			usage: 0,
		});

		// Customer balance should be 300 (100 + 150 + 150) - 50 customer credit deducted
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 300,
			current_balance: 300,
			usage: 0,
		});
	});

	test("update second entity balance from 150 to 200", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			current_balance: 200,
		});

		const entity2 = await autumnV2.entities.get<ApiCustomer>(
			customerId,
			entities[1].id,
		);
		expect(entity2.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 200,
			current_balance: 200,
			usage: 0,
		});

		// Customer balance should be 350 (100 + 200 + 150) - no deduction this time
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 350,
			current_balance: 350,
			usage: 0,
		});
	});

	test("update customer balance from 350 to 175 (sequential distribution)", async () => {
		// Current state: Entity 1: 100, Entity 2: 200, Entity 3: 150, Customer: 350
		// Update to 175: distribute sequentially
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 175,
		});

		// Sequential distribution: E1 gets 100 (fills up), E2 gets 75 (partial), E3 gets 0
		const entity1 = (await autumnV2.entities.get(
			customerId,
			entities[0].id,
		)) as ApiEntityV1;
		expect(entity1.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 100,
			current_balance: 100,
			usage: 0,
		});

		const entity2 = (await autumnV2.entities.get(
			customerId,
			entities[1].id,
		)) as ApiEntityV1;
		expect(entity2.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 75,
			current_balance: 75,
			usage: 0,
		});

		const entity3 = (await autumnV2.entities.get(
			customerId,
			entities[2].id,
		)) as ApiEntityV1;
		expect(entity3.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 0,
			current_balance: 0,
			usage: 0,
		});

		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 175,
			current_balance: 175,
			usage: 0,
		});
	});

	test("verify database state matches cache", async () => {
		// Wait for database sync
		await new Promise((resolve) => setTimeout(resolve, 2000));

		const expectedEntityBalances = [100, 75, 0];

		for (let i = 0; i < entities.length; i++) {
			const entityFromDb = (await autumnV2.entities.get(
				customerId,
				entities[i].id,
				{
					skip_cache: "true",
				},
			)) as ApiEntityV1;
			const entityFromCache = (await autumnV2.entities.get(
				customerId,
				entities[i].id,
			)) as ApiEntityV1;

			expect(entityFromDb.balances?.[TestFeature.Messages]).toMatchObject({
				granted_balance: expectedEntityBalances[i],
				current_balance: expectedEntityBalances[i],
				usage: 0,
			});

			expect(entityFromDb.balances?.[TestFeature.Messages]).toMatchObject(
				entityFromCache.balances?.[TestFeature.Messages] ?? {},
			);
		}

		const customerFromDb = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{
				skip_cache: "true",
			},
		);

		expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 175,
			current_balance: 175,
			usage: 0,
		});
	});

	test("track on entity, then update customer balance", async () => {
		// Current state: E1: 100, E2: 75, E3: 0 (from previous test)
		// Track 30 on entity 2 (currently has 75)
		await autumnV2.track({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			value: 30,
		});

		const entity2Before = (await autumnV2.entities.get(
			customerId,
			entities[1].id,
		)) as ApiEntityV1;
		expect(entity2Before.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 75,
			current_balance: 45,
			usage: 30,
		});

		// Customer should have 145 (100 + 45 + 0)
		const customerBefore = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customerBefore.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 175,
			current_balance: 145,
			usage: 30,
		});

		// Update customer balance to 290 (sequential distribution)
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 290,
		});

		// Sequential distribution: E1 fills to 100, E2 fills to 190, E3 gets 0
		const entity1After = (await autumnV2.entities.get(
			customerId,
			entities[0].id,
		)) as ApiEntityV1;
		expect(entity1After.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 100,
			current_balance: 100,
			usage: 0,
		});

		const entity2After = (await autumnV2.entities.get(
			customerId,
			entities[1].id,
		)) as ApiEntityV1;
		expect(entity2After.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 190,
			current_balance: 190,
			usage: 0,
		});

		const entity3After = (await autumnV2.entities.get(
			customerId,
			entities[2].id,
		)) as ApiEntityV1;
		expect(entity3After.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 0,
			current_balance: 0,
			usage: 0,
		});

		const customerAfter = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customerAfter.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 290,
			current_balance: 290,
			usage: 0,
		});
	});
});

