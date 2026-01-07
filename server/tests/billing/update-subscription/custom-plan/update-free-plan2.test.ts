import { beforeAll, describe, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

describe(`${chalk.yellowBright("custom-plan: update free plan")}`, () => {
	const testCase = "custom-plan-update-free-plan";

	const messagesItem = constructFeatureItem({
		featureId: TestFeature.Messages,
		includedUsage: 500,
	});

	const dashboardItem = constructFeatureItem({
		featureId: TestFeature.Dashboard,
		isBoolean: true,
	});

	const wordsItem = constructFeatureItem({
		featureId: TestFeature.Words,
		includedUsage: 100,
	});

	const free = constructProduct({
		type: "free",
		items: [messagesItem],
	});

	const customerId = testCase;
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		console.log("FILE 2 - describe 1 started at:", new Date().toISOString());
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: true,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [free],
			prefix: testCase,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: free.id,
		});
	});

	const messagesUsage = 100;
	test("should add boolean and metered feature to free plan", async () => {
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: messagesUsage,
			},
			{ timeout: 2000 },
		);

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: free.id,
			items: [messagesItem, dashboardItem, wordsItem],
		});
	});
});

describe(`${chalk.yellowBright("custom-plan: something else")}`, () => {
	const testCase = "custom-plan-update-free-plan";

	const messagesItem = constructFeatureItem({
		featureId: TestFeature.Messages,
		includedUsage: 500,
	});

	const dashboardItem = constructFeatureItem({
		featureId: TestFeature.Dashboard,
		isBoolean: true,
	});

	const wordsItem = constructFeatureItem({
		featureId: TestFeature.Words,
		includedUsage: 100,
	});

	const free = constructProduct({
		type: "free",
		items: [messagesItem],
	});

	const customerId = testCase;
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: true,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [free],
			prefix: testCase,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: free.id,
		});
	});

	const messagesUsage = 100;
	test("should add boolean and metered feature to free plan", async () => {
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: messagesUsage,
			},
			{ timeout: 2000 },
		);

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: free.id,
			items: [messagesItem, dashboardItem, wordsItem],
		});
	});
});
