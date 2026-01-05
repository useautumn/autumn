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
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

/**
 * Test: update-entity-balance4
 *
 * Tests setting negative current_balance values on entity balances
 * using arrear items (pay-per-use) which allow going into negative.
 */

const arrearMessages = constructArrearItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
	entityFeatureId: TestFeature.Users,
	price: 0.1,
	billingUnits: 1,
});

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [arrearMessages],
});

const testCase = "update-entity-balance4";

describe(`${chalk.yellowBright("update-entity-balance4: set negative balance on arrear entity items")}`, () => {
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
			attachPm: "success",
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

	test("initial state: customer should have 200 messages (100 per entity)", async () => {
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 200,
			current_balance: 200,
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

	test("check shows overage_allowed=true for arrear item", async () => {
		const checkRes = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(checkRes.balance?.overage_allowed).toBe(true);
	});

	test("update first entity balance to negative (-50)", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			current_balance: -50,
		});

		const entity1 = (await autumnV2.entities.get(
			customerId,
			entities[0].id,
		)) as ApiEntityV1;

		// Arrear items: current_balance goes to 0, purchased_balance absorbs the negative
		// granted_balance is set to -50, purchased_balance = 50, so current = -50 + 50 = 0
		expect(entity1.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: -50,
			current_balance: 0,
			purchased_balance: 50,
			usage: 0,
		});

		// Entity 2 should remain unchanged
		const entity2 = (await autumnV2.entities.get(
			customerId,
			entities[1].id,
		)) as ApiEntityV1;
		expect(entity2.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 100,
			current_balance: 100,
			purchased_balance: 0,
			usage: 0,
		});

		// Customer balance should reflect the sum: granted=-50+100=50, current=0+100=100
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 50,
			current_balance: 100,
			purchased_balance: 50,
			usage: 0,
		});
	});

	test("update first entity to deeper negative (-100)", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			current_balance: -100,
		});

		const entity1 = (await autumnV2.entities.get(
			customerId,
			entities[0].id,
		)) as ApiEntityV1;

		// granted_balance = -100, purchased_balance = 100, current = -100 + 100 = 0
		// usage stays 0 (updating current_balance doesn't change usage)
		expect(entity1.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: -100,
			current_balance: 0,
			purchased_balance: 100,
			usage: 0,
		});

		// Customer balance: granted=-100+100=0, current=0+100=100
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 0,
			current_balance: 100,
			purchased_balance: 100,
			usage: 0,
		});
	});

	test("update second entity to negative as well (-25)", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			current_balance: -25,
		});

		const entity2 = (await autumnV2.entities.get(
			customerId,
			entities[1].id,
		)) as ApiEntityV1;

		// granted_balance = -25, purchased_balance = 25, current = -25 + 25 = 0
		expect(entity2.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: -25,
			current_balance: 0,
			purchased_balance: 25,
			usage: 0,
		});

		// Customer balance: granted=-100+(-25)=-125, current=0+0=0
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: -125,
			current_balance: 0,
			purchased_balance: 125,
			usage: 0,
		});
	});

	test("update entity from negative back to positive", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			current_balance: 50,
		});

		const entity1 = (await autumnV2.entities.get(
			customerId,
			entities[0].id,
		)) as ApiEntityV1;

		// When positive, purchased_balance = 0, granted = current = 50
		expect(entity1.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 50,
			current_balance: 50,
			purchased_balance: 0,
			usage: 0,
		});

		// Customer balance: granted=50+(-25)=25, current=50+0=50
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 25,
			current_balance: 50,
			purchased_balance: 25,
			usage: 0,
		});
	});

	test("update entity from negative back to zero", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			current_balance: 0,
		});

		const entity2 = (await autumnV2.entities.get(
			customerId,
			entities[1].id,
		)) as ApiEntityV1;

		// Zero: granted = current = 0, purchased = 0
		expect(entity2.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 0,
			current_balance: 0,
			purchased_balance: 0,
			usage: 0,
		});

		// Customer balance: granted=50+0=50, current=50+0=50
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 50,
			current_balance: 50,
			purchased_balance: 0,
			usage: 0,
		});
	});

	test("verify database state matches cache for all entities", async () => {
		// Wait for database sync
		await new Promise((resolve) => setTimeout(resolve, 2000));

		const expectedEntityBalances = [
			{ granted: 50, current: 50, purchased: 0, usage: 0 },
			{ granted: 0, current: 0, purchased: 0, usage: 0 },
		];

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
				granted_balance: expectedEntityBalances[i].granted,
				current_balance: expectedEntityBalances[i].current,
				purchased_balance: expectedEntityBalances[i].purchased,
				usage: expectedEntityBalances[i].usage,
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
			granted_balance: 50,
			current_balance: 50,
			purchased_balance: 0,
			usage: 0,
		});
	});
});
