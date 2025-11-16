import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type LimitedItem } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { timeout } from "@tests/utils/genUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "track-entity-balances5";

// Customer-level messages (monthly) - kept low so it dips into entity balance
const customerMessagesItem = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 500,
	interval: "month" as any,
	intervalCount: 1,
}) as LimitedItem;

// Entity-level messages (monthly, per entity)
const entityMessagesItem = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 5000,
	entityFeatureId: TestFeature.Users,
	interval: "month" as any,
	intervalCount: 1,
}) as LimitedItem;

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [customerMessagesItem, entityMessagesItem],
});

const NUM_REQUESTS = 5000;
const NUM_CUSTOMERS = 1;
const NUM_ENTITIES = 2;

// Helper to generate random decimal between min and max
const randomDecimal = (min: number, max: number): Decimal => {
	const value = Math.random() * (max - min) + min;
	return new Decimal(value).toDecimalPlaces(2);
};

// Helper to randomly choose an entity or null (for customer-level)
const randomEntityOrNull = (entities: { id: string }[]): string | null => {
	// 50% chance customer-level, 50% chance entity-level
	if (Math.random() < 0.5) {
		return null; // Customer-level
	}
	// Randomly pick an entity
	const randomIndex = Math.floor(Math.random() * entities.length);
	return entities[randomIndex].id;
};

describe(`${chalk.yellowBright(`${testCase}: Concurrent per entity tracking`)}`, () => {
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	// Create multiple customers with their entities
	const customers = Array.from({ length: NUM_CUSTOMERS }, (_, i) => {
		const customerId = `${testCase}_customer${i + 1}`;
		return {
			id: customerId,
			entities: Array.from({ length: NUM_ENTITIES }, (_, i) => ({
				id: `${customerId}_user${i + 1}`,
				name: `User ${i + 1}`,
				feature_id: TestFeature.Users,
			})),
		};
	});

	// Track expected balances per customer
	const expectedCustomerBalances: Record<string, Decimal> = {};
	const expectedEntityBalances: Record<string, Decimal> = {};

	// Initialize expected balances
	for (const customer of customers) {
		expectedCustomerBalances[customer.id] = new Decimal(0);
		for (const entity of customer.entities) {
			expectedEntityBalances[entity.id] = new Decimal(0);
		}
	}

	beforeAll(async () => {
		for (const customer of customers) {
			await initCustomerV3({
				ctx,
				customerId: customer.id,
				withTestClock: false,
			});
		}
		// Initialize products once
		await initProductsV0({
			ctx,
			products: [freeProd],
			prefix: testCase,
		});

		// Initialize all customers
		for (const customer of customers) {
			await autumnV1.attach({
				customer_id: customer.id,
				product_id: freeProd.id,
			});

			await autumnV1.entities.create(customer.id, customer.entities);

			// Initialize cache
			for (const entity of customer.entities) {
				await autumnV1.entities.get(customer.id, entity.id);
			}
			await autumnV1.customers.get(customer.id);
		}
	});

	test("should have initial balances", async () => {
		for (const customer of customers) {
			const customerData = await autumnV1.customers.get(customer.id);

			console.log(`\n🔍 Initial state for ${customer.id}:`);
			console.log(
				`  Customer balance: ${customerData.features[TestFeature.Messages].balance}`,
			);
			console.log(
				`  Customer usage: ${customerData.features[TestFeature.Messages].usage}`,
			);

			// Customer should have: 200 (customer-level) + 1000*3 (entity-level) = 3200
			expect(customerData.features[TestFeature.Messages].balance).toBe(
				customerMessagesItem.included_usage +
					entityMessagesItem.included_usage * NUM_ENTITIES,
			);

			// Each entity should have: 1000 (entity-level) + 200 (customer-level inherited) = 1200
			for (const entity of customer.entities) {
				const _entity = await autumnV1.entities.get(customer.id, entity.id);
				console.log(
					`  Entity ${entity.id} balance: ${_entity.features[TestFeature.Messages].balance}`,
				);
				expect(_entity.features[TestFeature.Messages].balance).toBe(
					entityMessagesItem.included_usage +
						customerMessagesItem.included_usage,
				);
			}
		}
	});

	test(`should handle ${NUM_REQUESTS} concurrent requests with mixed entity/customer tracking`, async () => {
		console.log(
			`\n🚀 Starting ${NUM_REQUESTS} concurrent track requests across ${NUM_CUSTOMERS} customers...`,
		);

		const allPromises: Promise<void>[] = [];
		const trackingLogs: Record<
			string,
			Array<{ entityId: string | null; value: Decimal }>
		> = {};

		// Initialize tracking logs per customer
		for (const customer of customers) {
			trackingLogs[customer.id] = [];
		}

		for (let i = 0; i < NUM_REQUESTS; i++) {
			// Randomly pick a customer
			const customer = customers[Math.floor(Math.random() * customers.length)];

			// Generate random value between 0.01 and 2.00
			const decimalValue = randomDecimal(0.01, 2.0);
			const value = decimalValue.toNumber();

			// Randomly choose entity or customer-level
			const entityId = randomEntityOrNull(customer.entities);

			// Store for tracking
			trackingLogs[customer.id].push({ entityId, value: decimalValue });

			// Create track request
			const promise = autumnV1.track({
				customer_id: customer.id,
				entity_id: entityId || undefined,
				feature_id: TestFeature.Messages,
				value: value,
				skip_event: true,
			});

			allPromises.push(promise);
		}

		// Execute all requests concurrently
		const startTime = Date.now();
		await Promise.all(allPromises);
		const endTime = Date.now();

		console.log(
			`\n✅ Completed ${NUM_REQUESTS} requests in ${endTime - startTime}ms`,
		);
		console.log(
			`   Average: ${((endTime - startTime) / NUM_REQUESTS).toFixed(2)}ms per request`,
		);

		// Calculate expected balances by simulating deduction logic for each customer
		console.log(`\n📊 Calculating expected balances per customer...`);

		for (const customer of customers) {
			const trackingLog = trackingLogs[customer.id];

			console.log(`\n  ${customer.id}:`);
			console.log(`    Tracks: ${trackingLog.length}`);

			// Initialize balances (separate customer and entity balances)
			let customerBalance = new Decimal(customerMessagesItem.included_usage);
			const entityBalances: Record<string, Decimal> = {};
			for (const entity of customer.entities) {
				entityBalances[entity.id] = new Decimal(
					entityMessagesItem.included_usage,
				);
			}

			let customerLevelTracks = 0;
			let entityLevelTracks = 0;

			// Process each track sequentially to calculate expected state
			for (const log of trackingLog) {
				let remaining = log.value;

				if (log.entityId === null) {
					// Customer-level tracking: deduct from customer balance first, then entities in order
					customerLevelTracks++;

					// 1. Deduct from customer balance
					if (customerBalance.gt(0)) {
						const deducted = Decimal.min(customerBalance, remaining);
						customerBalance = customerBalance.minus(deducted);
						remaining = remaining.minus(deducted);
					}

					// 2. If remaining, deduct from entities in alphabetical order
					if (remaining.gt(0)) {
						const sortedEntityIds = Object.keys(entityBalances).sort();
						for (const entityId of sortedEntityIds) {
							if (remaining.lte(0)) break;

							const entityBalance = entityBalances[entityId];
							const deducted = Decimal.min(entityBalance, remaining);
							entityBalances[entityId] = entityBalance.minus(deducted);
							remaining = remaining.minus(deducted);
						}
					}
				} else {
					// Entity-level tracking: deduct from entity balance first, then customer balance
					entityLevelTracks++;

					// 1. Deduct from specific entity's balance first
					const entityBalance = entityBalances[log.entityId];
					if (entityBalance.gt(0)) {
						const deducted = Decimal.min(entityBalance, remaining);
						entityBalances[log.entityId] = entityBalance.minus(deducted);
						remaining = remaining.minus(deducted);
					}

					// 2. If remaining, deduct from customer balance
					if (remaining.gt(0)) {
						const deducted = Decimal.min(customerBalance, remaining);
						customerBalance = customerBalance.minus(deducted);
						remaining = remaining.minus(deducted);
					}
				}
			}

			console.log(`    Customer-level tracks: ${customerLevelTracks}`);
			console.log(`    Entity-level tracks: ${entityLevelTracks}`);
			console.log(
				`    Expected customer balance: ${customerBalance.toFixed(2)}`,
			);
			for (const entity of customer.entities) {
				console.log(
					`    Expected ${entity.id} balance: ${entityBalances[entity.id].toFixed(2)}`,
				);
			}

			// Store expected values for next test
			expectedCustomerBalances[customer.id] = customerBalance;
			for (const entity of customer.entities) {
				expectedEntityBalances[entity.id] = entityBalances[entity.id];
			}
		}
	});

	test("should have correct cached balances after concurrent tracking", async () => {
		for (const customer of customers) {
			const customerData = await autumnV1.customers.get(customer.id);

			console.log(`\n🔍 Final cached state for ${customer.id}:`);

			// Get expected customer balance for this customer
			const expectedCusBalance = expectedCustomerBalances[customer.id];

			// Get expected entity balances for this customer
			const expectedCusEntityBalances = customer.entities.reduce(
				(acc, entity) => {
					acc[entity.id] = expectedEntityBalances[entity.id];
					return acc;
				},
				{} as Record<string, Decimal>,
			);

			// Customer cache shows aggregated balance (customer + all entities)
			const expectedAggregatedBalance = expectedCusBalance.plus(
				Object.values(expectedCusEntityBalances).reduce(
					(sum, b) => sum.plus(b),
					new Decimal(0),
				),
			);

			console.log(
				`  Actual customer balance: ${customerData.features[TestFeature.Messages].balance}`,
			);
			console.log(
				`  Expected customer balance: ${expectedAggregatedBalance.toFixed(2)}`,
			);

			expect(customerData.features[TestFeature.Messages].balance).toBe(
				expectedAggregatedBalance.toNumber(),
			);

			// Each entity cache shows merged balance (entity + customer)
			for (const entity of customer.entities) {
				const _entity = await autumnV1.entities.get(customer.id, entity.id);
				const expectedEntityMergedBalance =
					expectedEntityBalances[entity.id].plus(expectedCusBalance);

				console.log(
					`  Actual ${entity.id} balance: ${_entity.features[TestFeature.Messages].balance}`,
				);
				console.log(
					`  Expected ${entity.id} balance: ${expectedEntityMergedBalance.toFixed(2)}`,
				);

				expect(_entity.features[TestFeature.Messages].balance).toBe(
					expectedEntityMergedBalance.toNumber(),
				);
			}
		}
	});

	test("verify database state matches cache after all tracking", async () => {
		console.log("\n⏳ Waiting 4s for DB sync...");
		await timeout(4000);

		for (const customer of customers) {
			// Read from database (skip cache)
			const customerFromDb = await autumnV1.customers.get(customer.id, {
				skip_cache: "true",
			});
			const customerFromCache = await autumnV1.customers.get(customer.id);

			// Customer features should match
			expect(customerFromDb.features[TestFeature.Messages]).toEqual(
				customerFromCache.features[TestFeature.Messages],
			);

			// All entities should match
			for (const entity of customer.entities) {
				const entityFromDb = await autumnV1.entities.get(
					customer.id,
					entity.id,
					{
						skip_cache: "true",
					},
				);
				const entityFromCache = await autumnV1.entities.get(
					customer.id,
					entity.id,
				);

				expect(entityFromDb.features[TestFeature.Messages]).toEqual(
					entityFromCache.features[TestFeature.Messages],
				);
			}
		}

		console.log("\n✅ All balances verified successfully!");
	});
});
