import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, ProductItemFeatureType } from "@autumn/shared";
import chalk from "chalk";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { timeout } from "../../../utils/genUtils.js";

const testCase = "track-allocated3";
const customerId = testCase;

// Continuous use feature (Postgres track)
const cusUserItem = constructFeatureItem({
	featureId: TestFeature.Workflows,
	includedUsage: 10,
	featureType: ProductItemFeatureType.ContinuousUse,
});

const entUserItem = constructFeatureItem({
	featureId: TestFeature.Workflows,
	includedUsage: 5,
	featureType: ProductItemFeatureType.ContinuousUse,
});

const customerProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [cusUserItem],
});

const entityProd = constructProduct({
	type: "free",
	isDefault: false,
	id: "entity_prod",
	items: [entUserItem],
});

describe(`${chalk.yellowBright(
	`track-allocated3: Concurrent tracking of consumable + allocated feature at entity / customer level`,
)}`, () => {
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	const entity1Id = "track-allocated3-user-1";
	const entity2Id = "track-allocated3-user-2";

	const entities = [
		{
			id: entity1Id,
			name: "User 1",
			feature_id: TestFeature.Users,
		},
		{
			id: entity2Id,
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
			products: [customerProd, entityProd],
			prefix: testCase,
		});

		// Attach product to customer
		await autumnV1.attach({
			customer_id: customerId,
			product_id: customerProd.id,
		});

		await autumnV1.entities.create(customerId, entities);

		for (const entity of entities) {
			await autumnV1.attach({
				customer_id: customerId,
				entity_id: entity.id,
				product_id: entityProd.id,
			});
		}
	});

	test("Initial balances after attach", async () => {
		// Wait for cache to populate
		await timeout(1000);

		const customer = await autumnV1.customers.get(customerId);

		expect(customer.features[TestFeature.Workflows].balance).toBe(20); // 10 + 5 * 2

		// Verify entity balances
		for (const entity of entities) {
			const _entity = await autumnV1.entities.get(customerId, entity.id);
			expect(_entity.features[TestFeature.Workflows].balance).toBe(10 + 5); // 3 + 10
		}
	});

	test("Random concurrent tracks across all 6 feature combinations", async () => {
		// Generate random track amounts for all 6 combinations
		const numCustomerWorkflows = Math.floor(Math.random() * 3) + 2; // 1-3
		const numEntity1Workflows = Math.floor(Math.random() * 2) + 1; // 1-2
		const numEntity2Workflows = Math.floor(Math.random() * 2) + 1; // 1-2

		console.log(`
Table of initial workflow balances and usage to track:
+-----------+-----------+-------------+
|   Scope   | Workflows | Used Amount |
+-----------+-----------+-------------+
| Customer  |    10     |     ${numCustomerWorkflows}      |
| Entity1   |     5     |     ${numEntity1Workflows}      |
| Entity2   |     5     |     ${numEntity2Workflows}      |
+-----------+-----------+-------------+
Total workflows to use: ${numCustomerWorkflows + numEntity1Workflows + numEntity2Workflows}
`);

		// Initial balances (from setup)
		const initialCusWorkflows = 10; // Customer-level workflows
		const initialEnt1Workflows = 5; // Entity1-level workflows
		const initialEnt2Workflows = 5; // Entity2-level workflows

		const trackPromises = [];

		// 2. Customer workflows (Postgres/continuous_use → syncCacheBalance)
		for (let i = 0; i < numCustomerWorkflows; i++) {
			trackPromises.push(
				autumnV1.track({
					customer_id: customerId,
					feature_id: TestFeature.Workflows,
					value: 1,
				}),
			);
		}

		// 4. Entity1 workflows (Postgres/continuous_use → syncCacheBalance)
		for (let i = 0; i < numEntity1Workflows; i++) {
			trackPromises.push(
				autumnV1.track({
					customer_id: customerId,
					entity_id: entity1Id,
					feature_id: TestFeature.Workflows,
					value: 1,
				}),
			);
		}

		// 6. Entity2 workflows (Postgres/continuous_use → syncCacheBalance)
		for (let i = 0; i < numEntity2Workflows; i++) {
			trackPromises.push(
				autumnV1.track({
					customer_id: customerId,
					entity_id: entity2Id,
					feature_id: TestFeature.Workflows,
					value: 1,
				}),
			);
		}

		await Promise.all(trackPromises);

		// Wait for sync to complete
		await timeout(2000);

		// Calculate expected balances after tracking
		const expectedCusWorkflows = initialCusWorkflows - numCustomerWorkflows;
		const expectedEnt1Workflows = initialEnt1Workflows - numEntity1Workflows;
		const expectedEnt2Workflows = initialEnt2Workflows - numEntity2Workflows;

		// Verify customer-level balances
		const customer = await autumnV1.customers.get(customerId);
		// expect(customer.features[TestFeature.Messages].balance).toBe(
		// 	expectedCustomerTotalMessages,
		// );
		expect(customer.features[TestFeature.Workflows].balance).toBe(
			expectedCusWorkflows + expectedEnt1Workflows + expectedEnt2Workflows,
		);

		// Check entity balances
		const entity1 = await autumnV1.entities.get(customerId, entity1Id);
		const entity2 = await autumnV1.entities.get(customerId, entity2Id);
		expect(entity1.features[TestFeature.Workflows].balance).toBe(
			expectedEnt1Workflows + expectedCusWorkflows,
		);
		expect(entity2.features[TestFeature.Workflows].balance).toBe(
			expectedEnt2Workflows + expectedCusWorkflows,
		);

		// Non cached
		const nonCachedCustomer = await autumnV1.customers.get(customerId, {
			skip_cache: "true",
		});
		expect(nonCachedCustomer.features[TestFeature.Workflows].balance).toBe(
			expectedCusWorkflows + expectedEnt1Workflows + expectedEnt2Workflows,
		);
		const nonCachedEntity1 = await autumnV1.entities.get(
			customerId,
			entity1Id,
			{
				skip_cache: "true",
			},
		);
		expect(nonCachedEntity1.features[TestFeature.Workflows].balance).toBe(
			expectedEnt1Workflows + expectedCusWorkflows,
		);
		const nonCachedEntity2 = await autumnV1.entities.get(
			customerId,
			entity2Id,
			{
				skip_cache: "true",
			},
		);
		expect(nonCachedEntity2.features[TestFeature.Workflows].balance).toBe(
			expectedEnt2Workflows + expectedCusWorkflows,
		);
	});
});
