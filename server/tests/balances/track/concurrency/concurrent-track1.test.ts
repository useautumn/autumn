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

const testCase = "concurrentTrack1";
const customerId = testCase;

const free = constructProduct({
	type: "free",
	isDefault: false,
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 5,
		}),
	],
});

describe(`${chalk.yellowBright(`concurrentTrack1: Testing track with concurrent requests and balance capping`)}`, () => {
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		await initProductsV0({
			ctx,
			products: [free],
			prefix: testCase,
		});

		// Attach product to customer
		await autumnV1.attach({
			customer_id: customerId,
			product_id: free.id,
		});
	});

	test("should have initial balance of 5", async () => {
		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Messages].balance;

		expect(balance).toBe(5);
	});

	test("should allow concurrent requests and cap balance at 0", async () => {
		// Send 5 concurrent requests, each trying to deduct 10
		// Only 5 should be deducted (initial balance), capping at 0
		const promises = [
			autumnV1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 10,
			}),
			autumnV1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 10,
			}),
			autumnV1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 10,
			}),
			autumnV1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 10,
			}),
			autumnV1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 10,
			}),
		];

		const results = await Promise.allSettled(promises);

		// With cap behavior, all requests pass (cap at 0 instead of rejecting)
		const allFulfilled = results.every((r) => r.status === "fulfilled");
		expect(allFulfilled).toBe(true);

		// Check final balance
		const customer = await autumnV1.customers.get(customerId);
		const finalBalance = customer.features[TestFeature.Messages].balance;
		const finalUsage = customer.features[TestFeature.Messages].usage;

		expect(finalBalance).toBe(0);
		expect(finalUsage).toBe(5); // Only 5 was actually deducted (initial balance)
	});
});
