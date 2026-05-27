import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "track-async";
const customerId = testCase;

const free = constructProduct({
	type: "free",
	isDefault: false,
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
	],
});

const ASYNC_QUEUE_URL_TEST =
	"https://sqs.us-east-1.amazonaws.com/123456789012/track-async-test.fifo";

describe(`${chalk.yellowBright("track-async: async=true returns 202 + success")}`, () => {
	const autumn: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });
	let originalAsyncEnv: string | undefined;

	beforeAll(async () => {
		originalAsyncEnv = process.env.TRACK_ASYNC_SQS_QUEUE_URL;
		process.env.TRACK_ASYNC_SQS_QUEUE_URL = ASYNC_QUEUE_URL_TEST;

		await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: false,
		});

		await initProductsV0({
			ctx,
			products: [free],
			prefix: customerId,
		});

		await autumn.attach({ customer_id: customerId, product_id: free.id });
	});

	afterAll(() => {
		process.env.TRACK_ASYNC_SQS_QUEUE_URL = originalAsyncEnv;
	});

	test("POST /v1/track with async=true returns 202 and { success: true }", async () => {
		const response = await fetch(`${autumn["baseUrl"]}/track`, {
			method: "POST",
			headers: autumn["headers"],
			body: JSON.stringify({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 1,
				async: true,
			}),
		});

		expect(response.status).toBe(202);
		const body = await response.json();
		expect(body).toEqual({ success: true });
	});

	test("POST /v1/track without async still returns 200 and a balance", async () => {
		const response = await fetch(`${autumn["baseUrl"]}/track`, {
			method: "POST",
			headers: autumn["headers"],
			body: JSON.stringify({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 1,
			}),
		});

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toHaveProperty("customer_id", customerId);
		expect(body).toHaveProperty("value");
	});
});
