import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type LimitedItem } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const lifetimeMessagesItem = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 50,
	entityFeatureId: TestFeature.Users,
}) as LimitedItem;

const monthlyMessagesItem = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
	interval: "month" as any,
	intervalCount: 1,
}) as LimitedItem;

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [lifetimeMessagesItem, monthlyMessagesItem],
});

const testCase = "track-entity-balances4";

describe(`${chalk.yellowBright("track-entity-balances4: customer balance with entity balances")}`, () => {
	const customerId = "track-entity-balances4";
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	const entities = [
		{
			id: "track-entity-balances4-user-1",
			name: "User 1",
			feature_id: TestFeature.Users,
		},
		{
			id: "track-entity-balances4-user-2",
			name: "User 2",
			feature_id: TestFeature.Users,
		},
		{
			id: "track-entity-balances4-user-3",
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

		await autumnV1.attach({
			customer_id: customerId,
			product_id: freeProd.id,
		});

		await autumnV1.entities.create(customerId, entities);

		// Initialize cache
		for (const entity of entities) {
			await autumnV1.entities.get(customerId, entity.id);
		}
		await autumnV1.customers.get(customerId);
	});

	test("should have correct customer / entity balances", async () => {
		const customer = await autumnV1.customers.get(customerId, {
			skip_cache: "true",
		});

		expect(customer.features[TestFeature.Messages].balance).toBe(
			monthlyMessagesItem.included_usage +
				lifetimeMessagesItem.included_usage * 3,
		);

		for (const entity of entities) {
			const _entity = await autumnV1.entities.get(customerId, entity.id);
			expect(_entity.features[TestFeature.Messages].balance).toBe(
				lifetimeMessagesItem.included_usage +
					monthlyMessagesItem.included_usage,
			);
		}
	});

	test("should track 50 messages at customer level", async () => {
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
		});

		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Messages].balance;
		const usage = customer.features[TestFeature.Messages].usage;

		expect(balance).toBe(200);
		expect(usage).toBe(50);
	});

	test("all entities should reflect customer-level deduction", async () => {
		// When customer tracks, all entity caches should be synced to show the same balance
		for (const entity of entities) {
			const fetchedEntity = await autumnV1.entities.get(customerId, entity.id);
			const balance = fetchedEntity.features[TestFeature.Messages].balance;

			// All entities should see the customer's updated balance (90)
			expect(balance).toBe(100);
		}
	});

	// Should draw 50 from customer level monthly, then 10 from entity lifetime
	test("track 60 messages at customer level -- draw from customer and entity simultaneously", async () => {
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 60,
		});

		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Messages].balance;
		const usage = customer.features[TestFeature.Messages].usage;

		expect(balance).toBe(250 - 110);
		expect(usage).toBe(110);

		for (const entity of entities) {
			const fetchedEntity = await autumnV1.entities.get(customerId, entity.id);
			const balance = fetchedEntity.features[TestFeature.Messages].balance;

			if (entity.id === "track-entity-balances4-user-1") {
				expect(balance).toBe(40);
			} else {
				expect(balance).toBe(50);
			}
		}
	});

	test("track 10 messages each at entity level -- draw from entity level", async () => {
		for (const entity of entities) {
			await autumnV1.track({
				customer_id: customerId,
				entity_id: entity.id,
				feature_id: TestFeature.Messages,
				value: 10,
			});
		}

		for (const entity of entities) {
			const fetchedEntity = await autumnV1.entities.get(customerId, entity.id);
			const balance = fetchedEntity.features[TestFeature.Messages].balance;

			if (entity.id === "track-entity-balances4-user-1") {
				expect(balance).toBe(30);
			} else {
				expect(balance).toBe(40);
			}
		}
	});

	test("verify database state matches cache after all tracking", async () => {
		// Wait for database sync
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Read from database (skip cache)
		const customerFromDb = await autumnV1.customers.get(customerId, {
			skip_cache: "true",
		});
		const customerFromCache = await autumnV1.customers.get(customerId);

		// Customer features should match
		expect(customerFromDb.features[TestFeature.Messages]).toEqual(
			customerFromCache.features[TestFeature.Messages],
		);

		// All entities should match
		for (const entity of entities) {
			const entityFromDb = await autumnV1.entities.get(customerId, entity.id, {
				skip_cache: "true",
			});
			const entityFromCache = await autumnV1.entities.get(
				customerId,
				entity.id,
			);

			expect(entityFromDb.features[TestFeature.Messages]).toEqual(
				entityFromCache.features[TestFeature.Messages],
			);
		}
	});
});
