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

describe(`${chalk.yellowBright("track-async: async=true returns 204")}`, () => {
	const autumn: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
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

	test("POST /v1/track with async=true returns 204 and no body", async () => {
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

		expect(response.status).toBe(204);
		expect(await response.text()).toBe("");
	});
});
