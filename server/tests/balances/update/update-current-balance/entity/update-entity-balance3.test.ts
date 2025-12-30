import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCustomer,
	type ApiEntityV1,
	ApiVersion,
	type CheckResponseV2,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const monthlyMessages = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
	interval: "month",
	intervalCount: 1,
	entityFeatureId: TestFeature.Users,
});

const lifetimeMessages = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 50,
	interval: null,
	entityFeatureId: TestFeature.Users,
});

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [monthlyMessages, lifetimeMessages],
});

const testCase = "update-entity-balance3";

describe(`${chalk.yellowBright("update-entity-balance3: update entity balance with multiple intervals (breakdown)")}`, () => {
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

	test("initial state: customer should have 300 messages (150 per entity), each entity 150", async () => {
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
				granted_balance: 150,
				current_balance: 150,
				usage: 0,
			});
		}
	});

	test("check breakdown for entity shows 2 items (monthly and lifetime)", async () => {
		const checkRes = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(checkRes.balance?.breakdown).toHaveLength(2);

		// Find monthly and lifetime breakdowns
		const monthlyBreakdown = checkRes.balance?.breakdown?.find(
			(b) => b.reset?.interval === "month",
		);
		const lifetimeBreakdown = checkRes.balance?.breakdown?.find(
			(b) => b.reset?.interval === null,
		);

		expect(monthlyBreakdown).toMatchObject({
			granted_balance: 100,
			current_balance: 100,
			usage: 0,
		});

		expect(lifetimeBreakdown).toMatchObject({
			granted_balance: 50,
			current_balance: 50,
			usage: 0,
		});
	});

	test("update first entity balance from 150 to 120", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			current_balance: 120,
		});

		const entity1 = await autumnV2.entities.get<ApiCustomer>(
			customerId,
			entities[0].id,
		);
		expect(entity1.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 120,
			current_balance: 120,
			usage: 0,
		});

		// Check breakdown is proportionally updated
		const checkRes = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		const monthlyBreakdown = checkRes.balance?.breakdown?.find(
			(b) => b.reset?.interval === "month",
		);
		const lifetimeBreakdown = checkRes.balance?.breakdown?.find(
			(b) => b.reset?.interval === null,
		);

		// 120 / 150 = 0.8, so monthly should be 80 and lifetime should be 40
		expect(monthlyBreakdown).toMatchObject({
			granted_balance: 80,
			current_balance: 80,
			usage: 0,
		});

		expect(lifetimeBreakdown).toMatchObject({
			granted_balance: 40,
			current_balance: 40,
			usage: 0,
		});

		// Customer balance should be 270 (120 + 150)
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 270,
			current_balance: 270,
			usage: 0,
		});
	});

	test("track usage on updated entity and verify breakdown", async () => {
		// Track 60 on entity 1 (currently has 120: 80 monthly + 40 lifetime)
		await autumnV2.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 60,
		});

		const entity1 = await autumnV2.entities.get<ApiCustomer>(
			customerId,
			entities[0].id,
		);
		expect(entity1.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 120,
			current_balance: 60,
			usage: 60,
		});

		// Check breakdown - should deduct from monthly first
		const checkRes = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		const monthlyBreakdown = checkRes.balance?.breakdown?.find(
			(b) => b.reset?.interval === "month",
		);
		const lifetimeBreakdown = checkRes.balance?.breakdown?.find(
			(b) => b.reset?.interval === null,
		);

		// Should deduct 60 from monthly (was 80, now 20)
		expect(monthlyBreakdown).toMatchObject({
			granted_balance: 80,
			current_balance: 20,
			usage: 60,
		});

		// Lifetime should remain untouched
		expect(lifetimeBreakdown).toMatchObject({
			granted_balance: 40,
			current_balance: 40,
			usage: 0,
		});
	});

	test("update entity balance after usage to 180", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			current_balance: 180,
		});

		const entity1 = await autumnV2.entities.get<ApiCustomer>(
			customerId,
			entities[0].id,
		);
		expect(entity1.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 180,
			current_balance: 180,
			usage: 0,
		});

		// Check breakdown is proportionally updated (180 / 150 = 1.2)
		const checkRes = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		const monthlyBreakdown = checkRes.balance?.breakdown?.find(
			(b) => b.reset?.interval === "month",
		);
		const lifetimeBreakdown = checkRes.balance?.breakdown?.find(
			(b) => b.reset?.interval === null,
		);

		expect(monthlyBreakdown).toMatchObject({
			granted_balance: 120,
			current_balance: 120,
			usage: 0,
		});

		expect(lifetimeBreakdown).toMatchObject({
			granted_balance: 60,
			current_balance: 60,
			usage: 0,
		});

		// Customer balance should be 330 (180 + 150)
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 330,
			current_balance: 330,
			usage: 0,
		});
	});

	test("update customer balance with sequential deduction across entities", async () => {
		// Current state: Entity 1: 180, Entity 2: 150, Customer: 330
		// Update customer from 330 to 165 (sequential deduction of 165)
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 165,
		});

		// Sequential deduction: Deduct 165 from Entity 1 first (180 → 15)
		const entity1 = (await autumnV2.entities.get(
			customerId,
			entities[0].id,
		)) as ApiEntityV1;
		expect(entity1.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 15,
			current_balance: 15,
			usage: 0,
		});

		// Entity 2 should stay at 150 (not touched)
		const entity2 = (await autumnV2.entities.get(
			customerId,
			entities[1].id,
		)) as ApiEntityV1;
		expect(entity2.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 150,
			current_balance: 150,
			usage: 0,
		});

		// Verify entity 1 breakdown - sequential deduction affects breakdown proportionally
		const checkRes1 = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		const monthly1 = checkRes1.balance?.breakdown?.find(
			(b) => b.reset?.interval === "month",
		);
		const lifetime1 = checkRes1.balance?.breakdown?.find(
			(b) => b.reset?.interval === null,
		);

		// 15 / 180 = 0.0833, so monthly: 120 * 0.0833 = 10, lifetime: 60 * 0.0833 = 5
		expect(monthly1).toMatchObject({
			granted_balance: 10,
			current_balance: 10,
			usage: 0,
		});

		expect(lifetime1).toMatchObject({
			granted_balance: 5,
			current_balance: 5,
			usage: 0,
		});
	});

	test("verify database state matches cache for all entities", async () => {
		// Wait for database sync
		await new Promise((resolve) => setTimeout(resolve, 2000));

		const expectedEntityBalances = [15, 150];

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

