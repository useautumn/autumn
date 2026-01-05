import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCustomer,
	type ApiEntityV1,
	ApiVersion,
	type CheckResponseV2,
	ProductItemInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

/**
 * Test: update-filters3
 *
 * Tests filtering balance updates by customer_entitlement_id for:
 * 1. Entity products (products attached to entities)
 * 2. Entity balances (per-entity feature items)
 *
 * Note: Entity balances share the same cusEntId but have different entity scopes.
 *
 * Scenario:
 * - Entity product: 100 messages attached to each entity
 * - Per-entity balance: 50 messages per entity (entityFeatureId = Users)
 */

const entityProductMessages = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
	interval: ProductItemInterval.Month,
});

const perEntityMessages = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 50,
	interval: ProductItemInterval.Month,
	entityFeatureId: TestFeature.Users,
});

const entityProd = constructProduct({
	type: "free",
	id: "entity-prod",
	isDefault: false,
	items: [entityProductMessages],
});

const perEntityProd = constructProduct({
	type: "free",
	id: "per-entity-prod",
	isDefault: false,
	items: [perEntityMessages],
});

const testCase = "update-filters3";

describe(`${chalk.yellowBright("update-filters3: entity products and entity balances filter")}`, () => {
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

	const entityProductBreakdownIds: { entityId: string; breakdownId: string }[] =
		[];
	let perEntityBreakdownId: string = "";

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		await initProductsV0({
			ctx,
			products: [entityProd, perEntityProd],
			prefix: testCase,
		});

		// Create entities
		await autumnV2.entities.create(customerId, entities);

		// Attach entity product to each entity
		for (const entity of entities) {
			await autumnV2.attach({
				customer_id: customerId,
				entity_id: entity.id,
				product_id: entityProd.id,
			});
		}

		// Attach per-entity product to customer
		await autumnV2.attach({
			customer_id: customerId,
			product_id: perEntityProd.id,
		});

		// Initialize caches
		await autumnV2.customers.get(customerId);
		for (const entity of entities) {
			await autumnV2.entities.get(customerId, entity.id);
		}

		// Get breakdown IDs for entity products
		for (const entity of entities) {
			const res = await autumnV2.check<CheckResponseV2>({
				customer_id: customerId,
				entity_id: entity.id,
				feature_id: TestFeature.Messages,
			});

			// Entity product breakdown (100) - unique per entity
			const entityProdBreakdown = res.balance?.breakdown?.find(
				(b) => b.granted_balance === 100,
			);
			if (entityProdBreakdown) {
				entityProductBreakdownIds.push({
					entityId: entity.id,
					breakdownId: entityProdBreakdown.id!,
				});
			}

			// Per-entity breakdown (50) - shared cusEntId
			const perEntityBreakdown = res.balance?.breakdown?.find(
				(b) => b.granted_balance === 50,
			);
			if (perEntityBreakdown && !perEntityBreakdownId) {
				perEntityBreakdownId = perEntityBreakdown.id!;
			}
		}
	});

	test("initial: each entity has 150 messages (100 entity prod + 50 per-entity)", async () => {
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

		// Customer total: 2 * (100 + 50) = 300
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 300,
			current_balance: 300,
			usage: 0,
		});
	});

	test("entity products have unique cusEntIds per entity", async () => {
		expect(entityProductBreakdownIds).toHaveLength(2);

		const uniqueIds = new Set(
			entityProductBreakdownIds.map((e) => e.breakdownId),
		);
		expect(uniqueIds.size).toBe(2);
	});

	test("per-entity balances share the same cusEntId", async () => {
		expect(perEntityBreakdownId).toBeTruthy();

		// Verify both entities see the same breakdown ID for per-entity balance
		for (const entity of entities) {
			const res = await autumnV2.check<CheckResponseV2>({
				customer_id: customerId,
				entity_id: entity.id,
				feature_id: TestFeature.Messages,
			});

			const perEntityBreakdown = res.balance?.breakdown?.find(
				(b) => b.granted_balance === 50,
			);
			expect(perEntityBreakdown?.id).toBe(perEntityBreakdownId);
		}
	});

	test("update entity product breakdown for entity 1 (100 → 75)", async () => {
		const entity1Breakdown = entityProductBreakdownIds.find(
			(e) => e.entityId === entities[0].id,
		);
		expect(entity1Breakdown).toBeDefined();

		await autumnV2.balances.update({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			current_balance: 75,
			customer_entitlement_id: entity1Breakdown!.breakdownId,
		});

		// Entity 1: 75 + 50 = 125
		const entity1 = (await autumnV2.entities.get(
			customerId,
			entities[0].id,
		)) as ApiEntityV1;
		expect(entity1.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 125,
			current_balance: 125,
			usage: 0,
		});

		// Entity 2 should be unchanged: 100 + 50 = 150
		const entity2 = (await autumnV2.entities.get(
			customerId,
			entities[1].id,
		)) as ApiEntityV1;
		expect(entity2.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 150,
			current_balance: 150,
			usage: 0,
		});

		// Customer total: 125 + 150 = 275
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 275,
			current_balance: 275,
			usage: 0,
		});
	});

	test("update entity product breakdown for entity 2 (100 → 120)", async () => {
		const entity2Breakdown = entityProductBreakdownIds.find(
			(e) => e.entityId === entities[1].id,
		);
		expect(entity2Breakdown).toBeDefined();

		await autumnV2.balances.update({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			current_balance: 120,
			customer_entitlement_id: entity2Breakdown!.breakdownId,
		});

		// Entity 2: 120 + 50 = 170
		const entity2 = (await autumnV2.entities.get(
			customerId,
			entities[1].id,
		)) as ApiEntityV1;
		expect(entity2.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 170,
			current_balance: 170,
			usage: 0,
		});

		// Customer total: 125 + 170 = 295
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 295,
			current_balance: 295,
			usage: 0,
		});
	});

	test("update per-entity balance for entity 1 (50 → 30) using shared cusEntId", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			current_balance: 30,
			customer_entitlement_id: perEntityBreakdownId,
		});

		// Entity 1: 75 + 30 = 105
		const entity1 = (await autumnV2.entities.get(
			customerId,
			entities[0].id,
		)) as ApiEntityV1;
		expect(entity1.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 105,
			current_balance: 105,
			usage: 0,
		});

		// Entity 2 should still have its per-entity balance of 50
		const entity2 = (await autumnV2.entities.get(
			customerId,
			entities[1].id,
		)) as ApiEntityV1;
		expect(entity2.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 170,
			current_balance: 170,
			usage: 0,
		});

		// Customer total: 105 + 170 = 275
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 275,
			current_balance: 275,
			usage: 0,
		});
	});

	test("verify database state matches cache", async () => {
		// Wait for database sync
		await new Promise((resolve) => setTimeout(resolve, 2000));

		for (const entity of entities) {
			const entityFromDb = (await autumnV2.entities.get(customerId, entity.id, {
				skip_cache: "true",
			})) as ApiEntityV1;
			const entityFromCache = (await autumnV2.entities.get(
				customerId,
				entity.id,
			)) as ApiEntityV1;

			expect(entityFromDb.balances?.[TestFeature.Messages]).toMatchObject(
				entityFromCache.balances?.[TestFeature.Messages] ?? {},
			);
		}

		const customerFromDb = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{ skip_cache: "true" },
		);

		expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 275,
			current_balance: 275,
			usage: 0,
		});
	});
});
