import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type LimitedItem } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

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

		for (const entity of entities) {
			await autumnV1.attach({
				customer_id: customerId,
				entity_id: entity.id,
				product_id: entityProd.id,
			});
		}

		await autumnV1.customers.get(customerId);
		for (const entity of entities) {
			await autumnV1.entities.get(customerId, entity.id);
		}
	});

	test.skipIf(isBalanceWorkerRoute())(
		"customer should have initial balance of 350 messages (50 customer + 100 monthly per entity)",
		async () => {
			const customer = await autumnV1.customers.get(customerId);

			expect(customer.features[TestFeature.Messages].balance).toBe(350);
		},
	);

	test("each entity should have initial balance of 150 messages (50 customer + 100 monthly)", async () => {
		for (const entity of entities) {
			const _entity = await autumnV1.entities.get(customerId, entity.id);
			expect(_entity.features![TestFeature.Messages].balance).toBe(150);
		}
	});

	for (let i = 0; i < entities.length; i++) {
		test(`track 20 messages on ${entities[i].id}`, async () => {
			await autumnV1.track({
				customer_id: customerId,
				entity_id: entities[i].id,
				feature_id: TestFeature.Messages,
				value: 20,
			});

			if (!isBalanceWorkerRoute()) {
				const customer = await autumnV1.customers.get(customerId);
				expect(customer.features[TestFeature.Messages].balance).toBe(
					350 - (i + 1) * 20,
				);
			}

			for (let j = 0; j < entities.length; j++) {
				const fetchedEntity = await autumnV1.entities.get(
					customerId,
					entities[j].id,
				);
				const expectedBalance = j <= i ? 150 - 20 : 150;
				expect(fetchedEntity.features![TestFeature.Messages].balance).toBe(
					expectedBalance,
				);
			}
		});
	}

	test("track 60 messages at customer level (customer-scoped only)", async () => {
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 60,
		});

		await autumnV1.customers.get(customerId);
		for (const entity of entities) {
			await autumnV1.entities.get(customerId, entity.id);
		}
	});

	test("verify database state matches cache after per-entity and customer-level tracking", async () => {
		await new Promise((resolve) => setTimeout(resolve, 2000));

		const customerFromDb = await autumnV1.customers.get(customerId, {
			skip_cache: "true",
		});
		const customerFromCache = await autumnV1.customers.get(customerId);

		expect(customerFromDb.features[TestFeature.Messages]).toMatchObject(
			customerFromCache.features[TestFeature.Messages],
		);

		const cacheBalance = customerFromCache.features[TestFeature.Messages];
		expect(customerFromDb.features[TestFeature.Messages]).toMatchObject({
			id: cacheBalance.id,
			balance: cacheBalance.balance,
			included_usage: cacheBalance.included_usage,
			interval: cacheBalance.interval,
			name: cacheBalance.name,
			next_reset_at: cacheBalance.next_reset_at,
			overage_allowed: cacheBalance.overage_allowed,
			type: cacheBalance.type,
			unlimited: cacheBalance.unlimited,
			usage: cacheBalance.usage,
		});

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

			expect(entityFromDb.features[TestFeature.Messages]).toMatchObject({
				balance: entityFromCache.features[TestFeature.Messages].balance,
				included_usage:
					entityFromCache.features[TestFeature.Messages].included_usage,
				interval: entityFromCache.features[TestFeature.Messages].interval,
				name: entityFromCache.features[TestFeature.Messages].name,
				type: entityFromCache.features[TestFeature.Messages].type,
				unlimited: entityFromCache.features[TestFeature.Messages].unlimited,
			});

			if (entityFromCache.features[TestFeature.Messages].breakdown) {
				for (
					let i = 0;
					i < entityFromCache.features[TestFeature.Messages].breakdown.length;
					i++
				) {
					const breakdown =
						entityFromCache.features[TestFeature.Messages].breakdown[i];
					expect(
						entityFromDb.features[TestFeature.Messages].breakdown?.[i],
					).toMatchObject({
						balance: breakdown?.balance,
						included_usage: breakdown?.included_usage,
						interval: breakdown?.interval,
						usage: breakdown?.usage,
					});
				}
			}

			totalEntityBalanceFromDb +=
				entityFromDb.features?.[TestFeature.Messages]?.balance ?? 0;
			totalEntityBalanceFromCache +=
				entityFromCache.features?.[TestFeature.Messages]?.balance ?? 0;
		}

		expect(totalEntityBalanceFromDb).toBe(totalEntityBalanceFromCache);
	});
});
