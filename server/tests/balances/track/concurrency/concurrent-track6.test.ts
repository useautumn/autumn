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

const lifetimeMessagesItem = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 20000,
	interval: null,
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

const NUM_REQUESTS = 500;
const NUM_CUSTOMERS = 3;

const TOTAL_INCLUDED_USAGE =
	(lifetimeMessagesItem.included_usage ?? 0) +
	(monthlyMessagesItem.included_usage ?? 0);

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

	const customerExpectedUsage: Record<string, Decimal> = {};

	beforeAll(async () => {
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

		for (const customerId of customerIds) {
			const customerPromises: Promise<number>[] = [];

			for (let i = 0; i < NUM_REQUESTS; i++) {
				const decimalValue = randomDecimal(0.01, 2.0);
				const value = decimalValue.toDecimalPlaces(5).toNumber();

				customerExpectedUsage[customerId] =
					customerExpectedUsage[customerId].plus(decimalValue);

				const requestStart = Date.now();
				const promise = autumnV1
					.track({
						customer_id: customerId,
						feature_id: TestFeature.Messages,
						value: value,
						skip_event: true,
					})
					.then(() => Date.now() - requestStart);

				customerPromises.push(promise);
			}

			allPromises.push(...customerPromises);
		}

		const startTime = Date.now();
		const durations = await Promise.all(allPromises);
		const endTime = Date.now();

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

			const expectedUsage = Decimal.min(totalUsage, TOTAL_INCLUDED_USAGE)
				.toDP(5)
				.toNumber();
			const actualUsage = new Decimal(
				customer.features[TestFeature.Messages].usage ?? 0,
			)
				.toDP(5)
				.toNumber();

			expect(actualBalance).toEqual(expectedBalance);
			expect(actualUsage).toEqual(expectedUsage);

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

			const expectedUsage = Decimal.min(totalUsage, TOTAL_INCLUDED_USAGE)
				.toDP(5)
				.toNumber();
			const actualUsage = new Decimal(
				customer.features[TestFeature.Messages].usage ?? 0,
			)
				.toDP(5)
				.toNumber();

			expect(actualBalance).toEqual(expectedBalance);

			expect(actualUsage).toEqual(expectedUsage);

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
