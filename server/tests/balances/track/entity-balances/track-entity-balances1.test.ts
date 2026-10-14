import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { expectProductAttached } from "../../../utils/expectUtils/expectProductAttached.js";

const dashboardItem = constructFeatureItem({
	featureId: TestFeature.Dashboard,
	includedUsage: 1,
});

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [dashboardItem],
});

const testCase = "track-entity-balances1";

describe(`${chalk.yellowBright("track-entity-balances1: basic entity cache test")}`, () => {
	const customerId = "track-entity-balances1";
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	const entities = [
		{
			id: "track-entity-balances1-user-1",
			name: "User 1",
			feature_id: TestFeature.Users,
		},
		{
			id: "track-entity-balances1-user-2",
			name: "User 2",
			feature_id: TestFeature.Users,
		},
		{
			id: "track-entity-balances1-user-3",
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
	});

	test("should initialize cache for customer and entities", async () => {
		const customer = await autumnV1.customers.get(customerId);
		expect(customer).toBeDefined();

		for (const entity of entities) {
			const fetchedEntity = await autumnV1.entities.get(customerId, entity.id);
			expect(fetchedEntity).toBeDefined();
		}
	});

	test("customer should have dashboard access and product", async () => {
		const customer = await autumnV1.customers.get(customerId);

		expect(customer.features[TestFeature.Dashboard]).toBeDefined();

		expectProductAttached({
			customer,
			product: freeProd,
		});
	});

	test("each entity should have dashboard access and product", async () => {
		for (const entity of entities) {
			const fetchedEntity = await autumnV1.entities.get(customerId, entity.id);

			expect(fetchedEntity.features[TestFeature.Dashboard]).toBeDefined();

			expectProductAttached({
				customer: fetchedEntity,
				product: freeProd,
			});
		}
	});

	test("verify database state matches cache", async () => {
		await new Promise((resolve) => setTimeout(resolve, 2000));

		const customerFromDb = await autumnV1.customers.get(customerId, {
			skip_cache: "true",
		});
		const customerFromCache = await autumnV1.customers.get(customerId);

		expect(customerFromCache.features[TestFeature.Dashboard]).toMatchObject(
			customerFromDb.features[TestFeature.Dashboard],
		);

		for (const entity of entities) {
			const entityFromDb = await autumnV1.entities.get(customerId, entity.id, {
				skip_cache: "true",
			});
			const entityFromCache = await autumnV1.entities.get(
				customerId,
				entity.id,
			);

			expect(entityFromCache.features[TestFeature.Dashboard]).toMatchObject(
				entityFromDb.features[TestFeature.Dashboard],
			);
		}
	});
});
