import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import chalk from "chalk";
import { TestFeature } from "@tests/setup/v2Features.js";
import { timeout } from "@tests/utils/genUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { trackWasSuccessful } from "../trackTestUtils.js";

const testCase = "concurrentTrack4";
const customerId = testCase;

const messageItem = constructArrearItem({
	featureId: TestFeature.Messages,
	includedUsage: 5,
	price: 0.1,
	billingUnits: 1,
	usageLimit: 10,
});

const pro = constructProduct({
	id: "pro",
	items: [messageItem],
	type: "pro",
});

describe(`${chalk.yellowBright(`${testCase}: Testing usage_limits with pay_per_use feature and concurrent requests`)}`, () => {
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [pro],
			prefix: testCase,
		});

		// Attach product to customer
		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		});
	});

	test("should have initial balance of 5 with usage_limit of 10", async () => {
		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Messages].balance;
		const usageLimit = customer.features[TestFeature.Messages].usage_limit;

		expect(balance).toBe(5);
		expect(usageLimit).toBe(10);
	});

	test("should enforce usage_limit with concurrent requests", async () => {
		console.log(
			"🚀 Starting 5 concurrent track calls (3 units each) at exact same time...",
		);

		// Try to use 3 units concurrently - with usage_limit of 10, only 3 requests can succeed (3x3=9 <= 10)
		const promises = [
			autumnV1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 3,
				overage_behavior: "reject",
			}),
			autumnV1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 3,
				overage_behavior: "reject",
			}),
			autumnV1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 3,
				overage_behavior: "reject",
			}),
			autumnV1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 3,
				overage_behavior: "reject",
			}),
			autumnV1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 3,
				overage_behavior: "reject",
			}),
		];

		const results = await Promise.all(promises);
		// console.log(results);

		const successCount = results.filter((r) =>
			trackWasSuccessful({ res: r }),
		).length;

		const rejectedCount = results.filter(
			(r) => !trackWasSuccessful({ res: r }),
		).length;

		expect(successCount).toBe(3);
		expect(rejectedCount).toBe(2);

		// Wait for any async processing to complete

		const customer = await autumnV1.customers.get(customerId);

		expect(customer.features[TestFeature.Messages]?.balance).toBe(-4);
		expect(customer.features[TestFeature.Messages]?.usage).toBe(9);
		expect(customer.features[TestFeature.Messages]?.usage_limit).toBe(10);
	});

	test("should reflect concurrent deductions in non-cached customer after 2s", async () => {
		// Expected: 3 successful requests × 3 units each = 9 units used
		// Starting balance: 5, usage: 9, final balance: 5 - 9 = -4

		// Wait 2 seconds for DB sync
		await timeout(5000);

		// Fetch customer with skip_cache=true
		const customer = await autumnV1.customers.get(customerId, {
			skip_cache: "true",
		});

		expect(customer.features[TestFeature.Messages]?.balance).toBe(-4);
		expect(customer.features[TestFeature.Messages]?.usage).toBe(9);
		expect(customer.features[TestFeature.Messages]?.usage_limit).toBe(10);
	});
});
