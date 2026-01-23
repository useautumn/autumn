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

const testCase = "concurrentTrack6";

// Product with both lifetime and monthly Messages features
const lifetimeMessagesItem = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 20000,
	interval: null, // Lifetime
}) as LimitedItem;

const monthlyMessagesItem = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 10000,
	interval: "month" as any,
	intervalCount: 1,
}) as LimitedItem;

const pro = constructProduct({
	type: "free",
	isDefault: false,
	items: [lifetimeMessagesItem, monthlyMessagesItem],
});

const NUM_REQUESTS = 5000; // Reduced from 10000 to avoid DB parameter limits
const NUM_CUSTOMERS = 3;

// Calculate total included usage dynamically
const TOTAL_INCLUDED_USAGE =
	(lifetimeMessagesItem.included_usage ?? 0) +
	(monthlyMessagesItem.included_usage ?? 0);

// Helper to generate random decimal between min and max using Decimal.js
const randomDecimal = (min: number, max: number): Decimal => {
	const value = Math.random() * (max - min) + min;
	return new Decimal(value).toDecimalPlaces(2);
};

describe(`${chalk.yellowBright(`${testCase}: Stress test with 10k concurrent requests per customer`)}`, () => {
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });
	const customerIds = Array.from(
		{ length: NUM_CUSTOMERS },
		(_, i) => `${testCase}_customer${i + 1}`,
	);

	// Store expected total usage per customer using Decimal for precision
	const customerExpectedUsage: Record<string, Decimal> = {};

	beforeAll(async () => {
		// Initialize all customers
		for (const customerId of customerIds) {
			await initCustomerV3({
				ctx,
				customerId,
				withTestClock: false,
			});
		}

		await initProductsV0({
			ctx,
			products: [pro],
			prefix: testCase,
		});

		for (const customerId of customerIds) {
			await autumnV1.attach({
				customer_id: customerId,
				product_id: pro.id,
			});

			// Initialize expected usage to 0
			customerExpectedUsage[customerId] = new Decimal(0);
		}
	});

	test("should have initial balances for all customers", async () => {
		for (const customerId of customerIds) {
			const customer = await autumnV1.customers.get(customerId);

			console.log(`\n🔍 Initial state for ${customerId}:`);
			console.log(
				`  Balance: ${customer.features[TestFeature.Messages].balance}`,
			);
			console.log(`  Usage: ${customer.features[TestFeature.Messages].usage}`);

			// Total balance should be lifetime + monthly
			expect(customer.features[TestFeature.Messages].balance).toBe(
				TOTAL_INCLUDED_USAGE,
			);
			expect(customer.features[TestFeature.Messages].usage).toBe(0);
			expect(customer.features[TestFeature.Messages].breakdown?.length).toBe(2);
		}
	});

	test(`should handle ${NUM_REQUESTS * NUM_CUSTOMERS} concurrent requests across ${NUM_CUSTOMERS} customers`, async () => {
		console.log(
			`\n🚀 Starting ${NUM_REQUESTS * NUM_CUSTOMERS} concurrent track requests...`,
		);
		console.log(
			`   ${NUM_REQUESTS} requests per customer × ${NUM_CUSTOMERS} customers`,
		);

		const allPromises: Promise<number>[] = [];

		// Generate requests for each customer
		for (const customerId of customerIds) {
			const customerPromises: Promise<number>[] = [];

			for (let i = 0; i < NUM_REQUESTS; i++) {
				// Generate random value between 0.01 and 2.00 using Decimal
				const decimalValue = randomDecimal(0.01, 2.0);
				const value = decimalValue.toDecimalPlaces(5).toNumber();

				// Accumulate expected usage using Decimal for precision
				customerExpectedUsage[customerId] =
					customerExpectedUsage[customerId].plus(decimalValue);

				// Create track request for Messages feature with timing
				const requestStart = Date.now();
				const promise = autumnV1
					.track({
						customer_id: customerId,
						feature_id: TestFeature.Messages,
						value: value,
						skip_event: true, // Skip event insertion for stress test
					})
					.then(() => Date.now() - requestStart);

				customerPromises.push(promise);
			}

			allPromises.push(...customerPromises);
		}

		// Execute all requests concurrently
		const startTime = Date.now();
		const durations = await Promise.all(allPromises);
		const endTime = Date.now();

		// Calculate P99
		const sortedDurations = durations.sort((a, b) => a - b);
		const p99Index = Math.floor(sortedDurations.length * 0.99);
		const p99 = sortedDurations[p99Index];

		console.log(
			`\n✅ Completed ${NUM_REQUESTS * NUM_CUSTOMERS} requests in ${endTime - startTime}ms`,
		);
		console.log(
			`   Average: ${((endTime - startTime) / (NUM_REQUESTS * NUM_CUSTOMERS)).toFixed(2)}ms per request`,
		);
		console.log(`   P99: ${p99.toFixed(2)}ms`);

		// Log expected totals per customer
		for (const customerId of customerIds) {
			console.log(`\n📊 ${customerId}:`);
			console.log(
				`   Total usage: ${customerExpectedUsage[customerId].toFixed(2)} units`,
			);
		}
	});

	test("should have correct cached balances for all customers", async () => {
		for (const customerId of customerIds) {
			const customer = await autumnV1.customers.get(customerId);

			const totalUsage = customerExpectedUsage[customerId];

			// Balance should be capped at 0 (no negative balances without overage_allowed)
			const expectedBalance = Decimal.max(
				0,
				new Decimal(TOTAL_INCLUDED_USAGE).minus(totalUsage),
			)
				.toDP(5)
				.toNumber();
			const actualBalance = new Decimal(
				customer.features[TestFeature.Messages].balance ?? 0,
			)
				.toDP(5)
				.toNumber();

			// Usage should be capped at included_usage without overage_allowed
			const expectedUsage = Decimal.min(totalUsage, TOTAL_INCLUDED_USAGE)
				.toDP(5)
				.toNumber();
			const actualUsage = new Decimal(
				customer.features[TestFeature.Messages].usage ?? 0,
			)
				.toDP(5)
				.toNumber();

			// Verify balance and usage match expectations
			expect(actualBalance).toEqual(expectedBalance);
			expect(actualUsage).toEqual(expectedUsage);

			// Verify breakdown balances sum to top-level balance
			const breakdown = customer.features[TestFeature.Messages].breakdown;
			if (breakdown && breakdown.length > 0) {
				const breakdownBalance = breakdown.reduce(
					(sum, b) => new Decimal(sum).plus(b.balance || 0).toNumber(),
					0,
				);
				expect(new Decimal(breakdownBalance).toDP(5).toNumber()).toEqual(
					actualBalance!,
				);
			}
		}
	});

	test("should have correct non-cached balances for all customers after 2s", async () => {
		console.log("\n⏳ Waiting 2s for DB sync...");
		await timeout(5000);

		for (const customerId of customerIds) {
			const customer = await autumnV1.customers.get(customerId, {
				skip_cache: "true",
			});

			const totalUsage = customerExpectedUsage[customerId];

			// Balance should be capped at 0 (no negative balances without overage_allowed)
			const expectedBalance = Decimal.max(
				0,
				new Decimal(TOTAL_INCLUDED_USAGE).minus(totalUsage),
			)
				.toDP(5)
				.toNumber();
			const actualBalance = new Decimal(
				customer.features[TestFeature.Messages].balance ?? 0,
			)
				.toDP(5)
				.toNumber();

			// Usage should be capped at included_usage without overage_allowed
			const expectedUsage = Decimal.min(totalUsage, TOTAL_INCLUDED_USAGE)
				.toDP(5)
				.toNumber();
			const actualUsage = new Decimal(
				customer.features[TestFeature.Messages].usage ?? 0,
			)
				.toDP(5)
				.toNumber();

			// Use Decimal for precise comparisons - expect exact match
			expect(actualBalance).toEqual(expectedBalance);

			// Verify usage matches - expect exact match
			expect(actualUsage).toEqual(expectedUsage);

			// Verify breakdown balances match top-level (lifetime + monthly)
			const breakdown = customer.features[TestFeature.Messages].breakdown;
			if (breakdown && breakdown.length > 0) {
				const breakdownBalance = breakdown.reduce(
					(sum, b) => new Decimal(sum).plus(b.balance || 0).toNumber(),
					0,
				);

				expect(new Decimal(breakdownBalance).toDP(5).toNumber()).toEqual(
					actualBalance!,
				);
			}
		}

		console.log("\n✅ All balances verified successfully!");
	});
});
