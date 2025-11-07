import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, ProductItemFeatureType } from "@autumn/shared";
import chalk from "chalk";
import { TestFeature } from "tests/setup/v2Features.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "concurrentTrack2";
const customerId = testCase;

const userItem = constructFeatureItem({
	featureId: TestFeature.Users,
	includedUsage: 6,
	featureType: ProductItemFeatureType.ContinuousUse,
});

const messagesItem = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
	featureType: ProductItemFeatureType.ContinuousUse,
});

const pro = constructProduct({
	type: "free",
	isDefault: false,
	items: [userItem, messagesItem],
});

describe(`${chalk.yellowBright(`track-allocated1: Tracking allocated feature concurrently with consumable feature`)}`, () => {
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
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

	test("should have initial balance of 6 for users and 100 for messages", async () => {
		const customer = await autumnV1.customers.get(customerId);
		const usersBalance = customer.features[TestFeature.Users].balance;
		const messagesBalance = customer.features[TestFeature.Messages].balance;

		expect(usersBalance).toBe(6);
		expect(messagesBalance).toBe(100);
	});

	test("should allow concurrent track with balance of 6 for users and 100 for messages", async () => {
		const promises = [
			autumnV1.track({
				customer_id: customerId,
				feature_id: TestFeature.Users,
				value: 1,
			}),
		];
	});

	// test("should only allow one concurrent track with balance of 1", async () => {
	// 	const promises = [
	// 		autumnV1.track({
	// 			customer_id: customerId,
	// 			feature_id: TestFeature.Users,
	// 			value: 1,
	// 		}),
	// 		autumnV1.track({
	// 			customer_id: customerId,
	// 			feature_id: TestFeature.Users,
	// 			value: 1,
	// 		}),
	// 		autumnV1.track({
	// 			customer_id: customerId,
	// 			feature_id: TestFeature.Users,
	// 			value: 1,
	// 		}),
	// 		autumnV1.track({
	// 			customer_id: customerId,
	// 			feature_id: TestFeature.Users,
	// 			value: 1,
	// 		}),
	// 		autumnV1.track({
	// 			customer_id: customerId,
	// 			feature_id: TestFeature.Users,
	// 			value: 1,
	// 		}),
	// 	];

	// 	await Promise.all(promises);

	// 	// console.log(results);
	// 	// return;

	// 	// const successCount = results.filter((r) => r.status === "fulfilled").length;
	// 	// const rejectedCount = results.filter((r) => r.status === "rejected").length;

	// 	// // Only 1 should succeed, 4 should be rejected due to insufficient balance
	// 	// expect(successCount).toBe(1);
	// 	// expect(rejectedCount).toBe(4);

	// 	// Check final balance
	// 	const customer = await autumnV1.customers.get(customerId);
	// 	const finalBalance = customer.features[TestFeature.Users].balance;

	// 	expect(finalBalance).toBe(-4);
	// });
});
