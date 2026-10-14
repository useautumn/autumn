import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
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

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [messagesItem],
});

const testCase = "track-entity-products1";

describe(`${chalk.yellowBright("track-entity-products1: entity product tracking")}`, () => {
	const customerId = "track-entity-products1";
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
			products: [freeProd],
			prefix: testCase,
		});

		await autumnV1.entities.create(customerId, entities);

		for (const entity of entities) {
			await autumnV1.attach({
				customer_id: customerId,
				entity_id: entity.id,
				product_id: freeProd.id,
			});
		}

		await autumnV1.customers.get(customerId);
		for (const entity of entities) {
			await autumnV1.entities.get(customerId, entity.id);
		}
	});

	test.skipIf(isBalanceWorkerRoute())(
		"customer should have initial balance of 300 messages (100 per entity)",
		async () => {
			const customer = await autumnV1.customers.get(customerId);

			const balance = customer.features[TestFeature.Messages].balance;

			expect(balance).toBe(300);
		},
	);

	test("each entity should have initial balance of 100 messages", async () => {
		for (const entity of entities) {
			const fetchedEntity = await autumnV1.entities.get(customerId, entity.id);
			const balance = fetchedEntity.features![TestFeature.Messages].balance;

			expect(balance).toBe(100);
		}
	});

	for (let i = 0; i < entities.length; i++) {
		test(`track 10 messages on ${entities[i].id}`, async () => {
			await autumnV1.track({
				customer_id: customerId,
				entity_id: entities[i].id,
				feature_id: TestFeature.Messages,
				value: 10,
			});

			const expectedCustomerBalance = 300 - (i + 1) * 10;
			if (!isBalanceWorkerRoute()) {
				const customer = await autumnV1.customers.get(customerId);
				expect(customer.features[TestFeature.Messages].balance).toBe(
					expectedCustomerBalance,
				);
			}

			for (let j = 0; j < entities.length; j++) {
				const fetchedEntity = await autumnV1.entities.get(
					customerId,
					entities[j].id,
				);
				const expectedBalance = j <= i ? 90 : 100;
				expect(fetchedEntity.features![TestFeature.Messages].balance).toBe(
					expectedBalance,
				);
			}
		});
	}

	test("verify database state matches cache after per-entity and customer-level tracking", async () => {
		await new Promise((resolve) => setTimeout(resolve, 4000));

		const customerFromDb = await autumnV1.customers.get(customerId, {
			skip_cache: "true",
		});
		await autumnV1.customers.get(customerId);

		if (!isBalanceWorkerRoute()) {
			expect(customerFromDb.features[TestFeature.Messages].balance).toBe(270);
		}
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

			totalEntityBalanceFromDb +=
				entityFromDb.features?.[TestFeature.Messages]?.balance ?? 0;
			totalEntityBalanceFromCache +=
				entityFromCache.features?.[TestFeature.Messages]?.balance ?? 0;
		}

		expect(totalEntityBalanceFromDb).toBe(270);
		expect(totalEntityBalanceFromCache).toBe(270);
	});
});
