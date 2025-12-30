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

const messagesItem = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
	entityFeatureId: TestFeature.Users, // Per-entity balance
});

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [messagesItem],
});

const testCase = "update-entity-balance2";

describe(`${chalk.yellowBright("update-entity-balance2: update specific entity balance")}`, () => {
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
			products: [freeProd],
			prefix: testCase,
		});

		await autumnV2.attach({
			customer_id: customerId,
			product_id: freeProd.id,
		});

		await autumnV2.entities.create(customerId, entities);

		// Initialize caches
		await autumnV2.customers.get(customerId);
		for (const entity of entities) {
			await autumnV2.entities.get(customerId, entity.id);
		}
	});

	test("initial state: customer should have 300 messages, each entity 100", async () => {
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
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
				granted_balance: 100,
				current_balance: 100,
				usage: 0,
			});
		}
	});

	test("update first entity balance from 100 to 70", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			current_balance: 70,
		});

		// First entity should have 70
		const entity1 = await autumnV2.entities.get<ApiCustomer>(
			customerId,
			entities[0].id,
		);
		expect(entity1.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 70,
			current_balance: 70,
			usage: 0,
		});

		// Other entities should still have 100
		const entity2 = await autumnV2.entities.get<ApiCustomer>(
			customerId,
			entities[1].id,
		);
		const entity3 = await autumnV2.entities.get<ApiCustomer>(
			customerId,
			entities[2].id,
		);

		expect(entity2.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 100,
			current_balance: 100,
			usage: 0,
		});

		expect(entity3.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 100,
			current_balance: 100,
			usage: 0,
		});

		// Customer balance should be 270 (70 + 100 + 100)
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 270,
			current_balance: 270,
			usage: 0,
		});
	});

	test("update second entity balance from 100 to 120", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			current_balance: 120,
		});

		// Second entity should have 120
		const entity2 = await autumnV2.entities.get<ApiCustomer>(
			customerId,
			entities[1].id,
		);
		expect(entity2.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 120,
			current_balance: 120,
			usage: 0,
		});

		// Customer balance should be 290 (70 + 120 + 100)
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 290,
			current_balance: 290,
			usage: 0,
		});
	});

	test("update third entity balance from 100 to 50", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			entity_id: entities[2].id,
			feature_id: TestFeature.Messages,
			current_balance: 50,
		});

		// Third entity should have 50
		const entity3 = await autumnV2.entities.get<ApiCustomer>(
			customerId,
			entities[2].id,
		);
		expect(entity3.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 50,
			current_balance: 50,
			usage: 0,
		});

		// Customer balance should be 240 (70 + 120 + 50)
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 240,
			current_balance: 240,
			usage: 0,
		});
	});

	test("verify database state matches cache for all entities", async () => {
		// Wait for database sync
		await new Promise((resolve) => setTimeout(resolve, 2000));

		const expectedEntityBalances = [70, 120, 50];

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

		// Verify customer balance
		const customerFromDb = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{
				skip_cache: "true",
			},
		);

		expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 240,
			current_balance: 240,
			usage: 0,
		});
	});

	test("track usage on updated entity and verify balances", async () => {
		// Track 20 messages on entity 1 (currently has 70)
		await autumnV2.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 20,
		});

		const entity1 = await autumnV2.entities.get<ApiCustomer>(
			customerId,
			entities[0].id,
		);
		expect(entity1.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 70,
			current_balance: 50,
			usage: 20,
		});

		// Customer balance should be 220 (50 + 120 + 50)
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 240,
			current_balance: 220,
			usage: 20,
		});
	});
});

