import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import chalk from "chalk";
import { TestFeature } from "tests/setup/v2Features.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const messagesItem = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
	entityFeatureId: TestFeature.Users, // Makes this PER entity
});

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [messagesItem],
});

const testCase = "track-entity-balances3";

describe(`${chalk.yellowBright("track-entity-balances3: per-entity balance tracking")}`, () => {
	const customerId = "track-entity-balances3";
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	const entities = [
		{
			id: "user-1",
			name: "User 1",
			feature_id: TestFeature.Users,
		},
		{
			id: "user-2",
			name: "User 2",
			feature_id: TestFeature.Users,
		},
		{
			id: "user-3",
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

		// Initialize caches
		await autumnV1.customers.get(customerId);
		for (const entity of entities) {
			await autumnV1.entities.get(customerId, entity.id);
		}
	});

	test("customer should have initial balance of 300 messages (100 per entity)", async () => {
		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Messages].balance;

		// 3 entities × 100 messages each = 300 total
		expect(balance).toBe(300);
	});

	test("each entity should have initial balance of 100 messages", async () => {
		for (const entity of entities) {
			const fetchedEntity = await autumnV1.entities.get(customerId, entity.id);
			const balance = fetchedEntity.features[TestFeature.Messages].balance;

			expect(balance).toBe(100);
		}
	});

	// Track 10 messages on each entity
	for (let i = 0; i < entities.length; i++) {
		test(`track 10 messages on ${entities[i].id}`, async () => {
			await autumnV1.track({
				customer_id: customerId,
				entity_id: entities[i].id,
				feature_id: TestFeature.Messages,
				value: 10,
			});

			// Customer should have 10 less
			const expectedCustomerBalance = 300 - (i + 1) * 10;
			const customer = await autumnV1.customers.get(customerId);
			expect(customer.features[TestFeature.Messages].balance).toBe(
				expectedCustomerBalance,
			);

			// Check all entity balances
			for (let j = 0; j < entities.length; j++) {
				const fetchedEntity = await autumnV1.entities.get(
					customerId,
					entities[j].id,
				);
				const expectedBalance = j <= i ? 90 : 100;
				expect(fetchedEntity.features[TestFeature.Messages].balance).toBe(
					expectedBalance,
				);
			}
		});
	}

	test("track 10 messages at customer level", async () => {
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});

		// Customer should have 10 less (now 260)
		const customer = await autumnV1.customers.get(customerId);
		expect(customer.features[TestFeature.Messages].balance).toBe(260);

		// Sum of entity balances should be 10 less (was 270, now 260)
		let totalEntityBalance = 0;
		for (const entity of entities) {
			const fetchedEntity = await autumnV1.entities.get(customerId, entity.id);
			totalEntityBalance +=
				fetchedEntity.features[TestFeature.Messages].balance;
		}
		expect(totalEntityBalance).toBe(260);
	});
});
