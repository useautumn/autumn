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
	entityFeatureId: TestFeature.Users, // Per-entity balance
});

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [messagesItem],
});

const testCase = "update-entity-balance1";

describe(`${chalk.yellowBright("update-entity-balance1: update per-entity balance at customer level")}`, () => {
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

	test("initial state: customer should have 300 messages (100 per entity)", async () => {
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		const balance = customer.balances[TestFeature.Messages];

		// 3 entities × 100 messages each = 300 total
		expect(balance).toMatchObject({
			granted_balance: 300,
			current_balance: 300,
			usage: 0,
			purchased_balance: 0,
		});
	});

	test("initial state: each entity should have 100 messages", async () => {
		for (const entity of entities) {
			const fetchedEntity = (await autumnV2.entities.get(
				customerId,
				entity.id,
			)) as ApiEntityV1;
			const balance = fetchedEntity.balances?.[TestFeature.Messages];

			expect(balance).toMatchObject({
				granted_balance: 100,
				current_balance: 100,
				usage: 0,
				purchased_balance: 0,
			});
		}
	});

	test("update customer balance from 300 to 240 (sequential deduction)", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 240,
		});

		// Customer should have updated balance
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		const balance = customer.balances[TestFeature.Messages];

		expect(balance).toMatchObject({
			granted_balance: 240,
			current_balance: 240,
			usage: 0,
			purchased_balance: 0,
		});

		// Sequential deduction: 60 deducted from first entity (100 → 40)
		// Entity 1: 40, Entity 2: 100, Entity 3: 100
		const entity1 = (await autumnV2.entities.get(
			customerId,
			entities[0].id,
		)) as ApiEntityV1;
		expect(entity1.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 40,
			current_balance: 40,
			usage: 0,
			purchased_balance: 0,
		});

		const entity2 = (await autumnV2.entities.get(
			customerId,
			entities[1].id,
		)) as ApiEntityV1;
		expect(entity2.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 100,
			current_balance: 100,
			usage: 0,
			purchased_balance: 0,
		});

		const entity3 = (await autumnV2.entities.get(
			customerId,
			entities[2].id,
		)) as ApiEntityV1;
		expect(entity3.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 100,
			current_balance: 100,
			usage: 0,
			purchased_balance: 0,
		});
	});

	test("verify database state matches cache after update", async () => {
		// Wait for database sync
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Verify customer from DB
		const customerFromDb = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{
				skip_cache: "true",
			},
		);
		const customerFromCache =
			await autumnV2.customers.get<ApiCustomer>(customerId);

		expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 240,
			current_balance: 240,
			usage: 0,
			purchased_balance: 0,
		});

		expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject(
			customerFromCache.balances[TestFeature.Messages],
		);

		// Verify all entities from DB - sequential deduction means: 40, 100, 100
		const expectedBalances = [40, 100, 100];

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
				granted_balance: expectedBalances[i],
				current_balance: expectedBalances[i],
				usage: 0,
				purchased_balance: 0,
			});

			expect(entityFromDb.balances?.[TestFeature.Messages]).toMatchObject(
				entityFromCache.balances?.[TestFeature.Messages] ?? {},
			);
		}
	});

	test("update customer balance from 240 to 150 (sequential deduction from 40, 100, 100)", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 150,
		});

		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 150,
			current_balance: 150,
			usage: 0,
		});

		// Sequential deduction of 90: First entity 40→0, second entity 100→50, third entity stays 100
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
			granted_balance: 50,
			current_balance: 50,
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
	});

	test("increase customer balance from 150 to 280 (sequential addition)", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 280,
		});

		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 280,
			current_balance: 280,
			usage: 0,
		});

		// Sequential addition of 130: First entity 0→100, second entity 50→80, third entity 100→100
		// (Assuming entities can go back to their original granted amount of 100)
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
			granted_balance: 80,
			current_balance: 80,
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
	});
});
