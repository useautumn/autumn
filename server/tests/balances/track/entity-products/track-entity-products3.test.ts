import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, ProductItemFeatureType } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { timeout } from "../../../utils/genUtils.js";

const testCase = "track-entity-products3";
const customerId = testCase;

// Continuous use feature (Postgres track)
const cusUserItem = constructFeatureItem({
	featureId: TestFeature.Workflows,
	includedUsage: 10,
	featureType: ProductItemFeatureType.ContinuousUse,
});

// Single use feature (Redis track)
const cusMessagesItem = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
	featureType: ProductItemFeatureType.SingleUse,
});

const entUserItem = constructFeatureItem({
	featureId: TestFeature.Workflows,
	includedUsage: 5,
	featureType: ProductItemFeatureType.ContinuousUse,
});

const entMessagesItem = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 50,
	featureType: ProductItemFeatureType.SingleUse,
});

const customerProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [cusUserItem, cusMessagesItem],
});

const entityProd = constructProduct({
	type: "free",
	isDefault: false,
	id: "entity_prod",
	items: [entUserItem, entMessagesItem],
});

describe(`${chalk.yellowBright(
	`track-entity-products3: Tracking customer / entity balance concurrently`,
)}`, () => {
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	const entity1Id = "track-entity-products3-user-1";
	const entity2Id = "track-entity-products3-user-2";

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

		// Customer level: workflows (10) + messages (50)
		// Entity level: workflows (3+3=6) + messages (100+100=200)
		expect(customer.features[TestFeature.Workflows].balance).toBe(20); // 10 + 5 * 2
		expect(customer.features[TestFeature.Messages].balance).toBe(200); // 100 + 50 * 2

		// Verify entity balances
		for (const entity of entities) {
			const _entity = await autumnV1.entities.get(customerId, entity.id);
			expect(_entity.features[TestFeature.Workflows].balance).toBe(10 + 5); // 3 + 10
			expect(_entity.features[TestFeature.Messages].balance).toBe(100 + 50); // 100 + 50
		}
	});

	test("Random concurrent tracks across all 6 feature combinations", async () => {
		// Generate random track amounts for all 6 combinations
		const numCustomerMessages = Math.floor(Math.random() * 20) + 5; // 5-25
		const numCustomerWorkflows = Math.floor(Math.random() * 3) + 2; // 1-3
		const numEntity1Messages = Math.floor(Math.random() * 10) + 2; // 2-12
		const numEntity1Workflows = Math.floor(Math.random() * 2) + 1; // 1-2
		const numEntity2Messages = Math.floor(Math.random() * 10) + 2; // 2-12
		const numEntity2Workflows = Math.floor(Math.random() * 2) + 1; // 1-2

		const summedCustomerMessagesResult =
			200 - numCustomerMessages - numEntity1Messages - numEntity2Messages;

		const summedEntity1MessagesResult =
			150 - numCustomerMessages - numEntity1Messages;

		const summedEntity2MessagesResult =
			150 - numCustomerMessages - numEntity2Messages;

		console.log(`
Table of initial customer message balances and deducted messages:
+-----------+-----------+----------+-----------------+----------------------+--------------------------+
|   Scope   | Workflows | Messages | Summed Messages | Summed Msg Result    | Deducted Messages        |
+-----------+-----------+----------+-----------------+----------------------+--------------------------+
| Customer  |    10     |   100    |      200        |    ${summedCustomerMessagesResult.toString().padEnd(19)}|  ${numCustomerMessages
			.toString()
			.padEnd(24)}|
| Entity1   |     5     |    50    |      150        |    ${summedEntity1MessagesResult.toString().padEnd(19)}|  ${numEntity1Messages
			.toString()
			.padEnd(24)}|
| Entity2   |     5     |    50    |      150        |    ${summedEntity2MessagesResult.toString().padEnd(19)}|  ${numEntity2Messages
			.toString()
			.padEnd(24)}|
+-----------+-----------+----------+-----------------+----------------------+--------------------------+
Total messages: 200, Total workflows: 20

(Deducted = how many messages were deducted at each level)
`);

		console.log(`Tracking:
  Customer: ${numCustomerMessages} messages, ${numCustomerWorkflows} workflows
  Entity1: ${numEntity1Messages} messages, ${numEntity1Workflows} workflows
  Entity2: ${numEntity2Messages} messages, ${numEntity2Workflows} workflows`);

		// Initial balances (from setup)
		const initialCusMessages = 100; // Customer-level messages
		const initialCusWorkflows = 10; // Customer-level workflows
		const initialEnt1Messages = 50; // Entity1-level messages
		const initialEnt1Workflows = 5; // Entity1-level workflows
		const initialEnt2Messages = 50; // Entity2-level messages
		const initialEnt2Workflows = 5; // Entity2-level workflows

		const trackPromises = [];

		// 1. Customer messages (Redis/single_use)
		for (let i = 0; i < numCustomerMessages; i++) {
			trackPromises.push(
				autumnV1.track({
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					value: 1,
				}),
			);
		}

		// 3. Entity1 messages (Redis/single_use)
		for (let i = 0; i < numEntity1Messages; i++) {
			trackPromises.push(
				autumnV1.track({
					customer_id: customerId,
					entity_id: entity1Id,
					feature_id: TestFeature.Messages,
					value: 1,
				}),
			);
		}

		// 5. Entity2 messages (Redis/single_use)
		for (let i = 0; i < numEntity2Messages; i++) {
			trackPromises.push(
				autumnV1.track({
					customer_id: customerId,
					entity_id: entity2Id,
					feature_id: TestFeature.Messages,
					value: 1,
				}),
			);
		}

		await Promise.all(trackPromises);

		// Wait for sync to complete
		await timeout(2000);

		// Calculate expected balances after tracking
		const expectedCusMessages = initialCusMessages - numCustomerMessages;
		const expectedEnt1Messages = initialEnt1Messages - numEntity1Messages;
		const expectedEnt2Messages = initialEnt2Messages - numEntity2Messages;

		// Customer-level totals (customer + all entities)
		const expectedCustomerTotalMessages =
			expectedCusMessages + expectedEnt1Messages + expectedEnt2Messages;

		// Verify customer-level balances
		const customer = await autumnV1.customers.get(customerId);
		expect(customer.features[TestFeature.Messages].balance).toBe(
			expectedCustomerTotalMessages,
		);

		await timeout(2000);

		// Verify non-cached to ensure Postgres matches
		const nonCachedCustomer = await autumnV1.customers.get(customerId, {
			skip_cache: "true",
		});
		expect(nonCachedCustomer.features[TestFeature.Messages].balance).toBe(
			expectedCustomerTotalMessages,
		);

		// Entity-level totals (entity + customer inherited)
		const expectedEntity1TotalMessages =
			expectedEnt1Messages + expectedCusMessages;
		const expectedEntity2TotalMessages =
			expectedEnt2Messages + expectedCusMessages;

		// Verify entity-level balances (entity + customer inherited)
		const entity1 = await autumnV1.entities.get(customerId, entity1Id);
		const entity2 = await autumnV1.entities.get(customerId, entity2Id);

		expect(entity1.features[TestFeature.Messages].balance).toBe(
			expectedEntity1TotalMessages,
		);

		expect(entity2.features[TestFeature.Messages].balance).toBe(
			expectedEntity2TotalMessages,
		);

		const nonCachedEntity1 = await autumnV1.entities.get(
			customerId,
			entity1Id,
			{
				skip_cache: "true",
			},
		);
		expect(nonCachedEntity1.features[TestFeature.Messages].balance).toBe(
			expectedEntity1TotalMessages,
		);

		const nonCachedEntity2 = await autumnV1.entities.get(
			customerId,
			entity2Id,
			{
				skip_cache: "true",
			},
		);
		expect(nonCachedEntity2.features[TestFeature.Messages].balance).toBe(
			expectedEntity2TotalMessages,
		);
	});
});
