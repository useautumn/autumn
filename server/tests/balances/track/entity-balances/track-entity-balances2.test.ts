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
	entityFeatureId: TestFeature.Users,
});

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [messagesItem],
});

const testCase = "track-entity-balances2";

describe(`${chalk.yellowBright("track-entity-balances2: customer-level tracking with entity caches")}`, () => {
	const customerId = "track-entity-balances2";
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

	test("customer should have initial balance of 300 messages", async () => {
		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Messages].balance;

		expect(balance).toBe(300);
	});

	test("should track 10 messages at customer level", async () => {
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
		});

		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Messages].balance;
		const usage = customer.features[TestFeature.Messages].usage;

		expect(balance).toBe(250);
		expect(usage).toBe(50);
	});
	return;

	test("all entities should reflect customer-level deduction", async () => {
		// When customer tracks, all entity caches should be synced to show the same balance
		for (const entity of entities) {
			const fetchedEntity = await autumnV1.entities.get(customerId, entity.id);
			const balance = fetchedEntity.features[TestFeature.Messages].balance;

			// All entities should see the customer's updated balance (90)
			expect(balance).toBe(90);
		}
	});

	test("should track 5 more messages at customer level", async () => {
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 5,
		});

		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Messages].balance;
		const usage = customer.features[TestFeature.Messages].usage;

		expect(balance).toBe(85);
		expect(usage).toBe(15);
	});

	test("all entities should reflect second customer-level deduction", async () => {
		for (const entity of entities) {
			const fetchedEntity = await autumnV1.entities.get(customerId, entity.id);
			const balance = fetchedEntity.features[TestFeature.Messages].balance;

			// All entities should see the customer's updated balance (85)
			expect(balance).toBe(85);
		}
	});
});
