import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type LimitedItem } from "@autumn/shared";
import chalk from "chalk";
import { TestFeature } from "tests/setup/v2Features.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

// const lifetimeMessagesItem = constructFeatureItem({
// 	featureId: TestFeature.Messages,
// 	includedUsage: 50,
// 	interval: null,
// }) as LimitedItem;

const entityItem = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
	interval: "month" as any,
	intervalCount: 1,
}) as LimitedItem;

const customerItem = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 50,
	interval: "month" as any,
	intervalCount: 1,
}) as LimitedItem;

const customerProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [customerItem],
});

const entityProd = constructProduct({
	type: "free",
	id: "entity_free",
	isDefault: false,
	items: [entityItem],
});

const testCase = "track-entity-products2";

describe(`${chalk.yellowBright("track-entity-products2: entity product tracking with mixed intervals")}`, () => {
	const customerId = "track-entity-products2";
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	const entities = [
		{
			id: `${customerId}-user-1`,
			name: "User 1",
			feature_id: TestFeature.Users,
		},
		{
			id: `${customerId}-user-2`,
			name: "User 2",
			feature_id: TestFeature.Users,
		},
		{
			id: `${customerId}-user-3`,
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

		await autumnV1.entities.create(customerId, entities);

		await autumnV1.attach({
			customer_id: customerId,
			product_id: customerProd.id,
		});

		// Attach product to each entity
		for (const entity of entities) {
			await autumnV1.attach({
				customer_id: customerId,
				entity_id: entity.id,
				product_id: entityProd.id,
			});
		}

		// Initialize caches
		await autumnV1.customers.get(customerId);
		for (const entity of entities) {
			await autumnV1.entities.get(customerId, entity.id);
		}
	});

	test("customer should have initial balance of 350 messages (50 customer + 100 monthly per entity)", async () => {
		const customer = await autumnV1.customers.get(customerId);

		// 3 entities × (50 lifetime + 100 monthly) = 450 total
		expect(customer.features[TestFeature.Messages].balance).toBe(350);
	});

	test("each entity should have initial balance of 150 messages (50 customer + 100 monthly)", async () => {
		for (const entity of entities) {
			const _entity = await autumnV1.entities.get(customerId, entity.id);
			expect(_entity.features[TestFeature.Messages].balance).toBe(150);
		}
	});

	// Track 20 messages on each entity (should deduct from monthly first, then lifetime)
	for (let i = 0; i < entities.length; i++) {
		test(`track 20 messages on ${entities[i].id}`, async () => {
			await autumnV1.track({
				customer_id: customerId,
				entity_id: entities[i].id,
				feature_id: TestFeature.Messages,
				value: 20,
			});

			// // Customer should have 20 less
			const customer = await autumnV1.customers.get(customerId);
			expect(customer.features[TestFeature.Messages].balance).toBe(
				350 - (i + 1) * 20,
			);

			// Check all entity balances
			for (let j = 0; j < entities.length; j++) {
				const fetchedEntity = await autumnV1.entities.get(
					customerId,
					entities[j].id,
				);
				// const total = customerItem.included_usage + entityItem.included_usage;
				const expectedBalance = j <= i ? 150 - 20 : 150;
				expect(fetchedEntity.features[TestFeature.Messages].balance).toBe(
					expectedBalance,
				);
			}
		});
	}

	test("track 60 messages at customer level (draw from customer then entity...)", async () => {
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 60,
		});

		// Customer should have 50 less (was 290, now 240)
		const customer = await autumnV1.customers.get(customerId);
		expect(customer.features[TestFeature.Messages].balance).toBe(230);

		// Sum of entity balances should be 50 less (was 390, now 340)
		let totalEntityBalance = 0;
		for (const entity of entities) {
			const fetchedEntity = await autumnV1.entities.get(customerId, entity.id);
			totalEntityBalance +=
				fetchedEntity.features[TestFeature.Messages].balance;

			console.log(
				`Entity ${entity.id} balance: ${fetchedEntity.features[TestFeature.Messages].balance}`,
			);
		}

		expect(totalEntityBalance).toBe(230);
	});

	test("verify database state matches cache after per-entity and customer-level tracking", async () => {
		// Wait for database sync
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Read from database (skip cache)
		const customerFromDb = await autumnV1.customers.get(customerId, {
			skip_cache: "true",
		});
		const customerFromCache = await autumnV1.customers.get(customerId);

		// Customer balance should be 230 (started at 290, deducted 60 at customer level: 50 from customer + 10 from entity)
		expect(customerFromDb.features[TestFeature.Messages].balance).toBe(230);
		expect(customerFromDb.features[TestFeature.Messages]).toMatchObject(
			customerFromCache.features[TestFeature.Messages],
		);

		// Verify each entity's balance
		let totalEntityBalanceFromDb = 0;
		let totalEntityBalanceFromCache = 0;

		for (const entity of entities) {
			const entityFromDb = await autumnV1.entities.get(customerId, entity.id, {
				skip_cache: "true",
			});
			const entityFromCache = await autumnV1.entities.get(
				customerId,
				entity.id,
			);

			// Each entity should have some messages deducted
			expect(entityFromDb.features[TestFeature.Messages]).toEqual(
				entityFromCache.features[TestFeature.Messages],
			);

			totalEntityBalanceFromDb +=
				entityFromDb.features[TestFeature.Messages].balance;
			totalEntityBalanceFromCache +=
				entityFromCache.features[TestFeature.Messages].balance;
		}

		// Sum of entity balances should be 230
		expect(totalEntityBalanceFromDb).toBe(230);
		expect(totalEntityBalanceFromCache).toBe(230);
	});
});
