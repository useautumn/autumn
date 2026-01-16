import { beforeAll, describe, expect, test } from "bun:test";
import { type ApiCustomer, type ApiEntityV1, ApiVersion } from "@autumn/shared";
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
});

const entityProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [messagesItem],
});

const testCase = "update-entity-products1";

describe(`${chalk.yellowBright("update-entity-products1: update entity balance with entity products")}`, () => {
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
			products: [entityProd],
			prefix: testCase,
		});

		await autumnV2.entities.create(customerId, entities);

		// Attach product to each entity
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

	test("initial state: customer should have 300 messages (100 per entity), each entity 100", async () => {
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

	test("update first entity balance from 100 to 80", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			current_balance: 80,
		});

		// First entity should have 80
		const entity1 = await autumnV2.entities.get<ApiEntityV1>(
			customerId,
			entities[0].id,
		);
		expect(entity1.balances![TestFeature.Messages]).toMatchObject({
			granted_balance: 80,
			current_balance: 80,
			usage: 0,
		});

		// Other entities should still have 100
		const entity2 = await autumnV2.entities.get<ApiEntityV1>(
			customerId,
			entities[1].id,
		);
		expect(entity2.balances![TestFeature.Messages]).toMatchObject({
			granted_balance: 100,
			current_balance: 100,
			usage: 0,
		});

		// Customer balance should be 280 (80 + 100 + 100)
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 280,
			current_balance: 280,
			usage: 0,
		});
	});

	test("update second entity balance from 100 to 150", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			current_balance: 150,
		});

		const entity2 = await autumnV2.entities.get<ApiEntityV1>(
			customerId,
			entities[1].id,
		);
		expect(entity2.balances![TestFeature.Messages]).toMatchObject({
			granted_balance: 150,
			current_balance: 150,
			usage: 0,
		});

		// Customer balance should be 330 (80 + 150 + 100)
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 330,
			current_balance: 330,
			usage: 0,
		});
	});

	test("update at customer level with sequential deduction", async () => {
		// Current state: Entity 1: 80, Entity 2: 150, Entity 3: 100, Customer: 330
		// Update customer balance from 330 to 165 (sequential deduction of 165)
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 165,
		});

		// Sequential deduction: Deduct 80 from Entity 1 (80 → 0), then 85 from Entity 2 (150 → 65), Entity 3 untouched
		const entity1 = (await autumnV2.entities.get(
			customerId,
			entities[0].id,
		)) as ApiEntityV1;
		expect(entity1.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 0,
			current_balance: 0,
			usage: 0,
		});

		const entity2 = (await autumnV2.entities.get(
			customerId,
			entities[1].id,
		)) as ApiEntityV1;
		expect(entity2.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 65,
			current_balance: 65,
			usage: 0,
		});

		const entity3 = (await autumnV2.entities.get(
			customerId,
			entities[2].id,
		)) as ApiEntityV1;
		expect(entity3.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 100,
			current_balance: 100,
			usage: 0,
		});

		// Customer should have 165
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 165,
			current_balance: 165,
			usage: 0,
		});
	});

	test("verify database state matches cache", async () => {
		// Wait for database sync
		await new Promise((resolve) => setTimeout(resolve, 2000));

		const expectedEntityBalances = [0, 65, 100];

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
			granted_balance: 165,
			current_balance: 165,
			usage: 0,
		});
	});
});
