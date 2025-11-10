import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import chalk from "chalk";
import { TestFeature } from "tests/setup/v2Features.js";
import { timeout } from "tests/utils/genUtils.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { trackWasSuccessful } from "../trackTestUtils.js";

const testCase = "track-basic8";
const customerId = testCase;

// Prepaid feature: 5 included, no overage allowed
const prepaidItem = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 5,
});

const prepaidProduct = constructProduct({
	id: "prepaid",
	items: [prepaidItem],
	type: "pro",
});

describe(`${chalk.yellowBright(`${testCase}: Testing prepaid (no overage) with reject behavior`)}`, () => {
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
			products: [prepaidProduct],
			prefix: testCase,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: prepaidProduct.id,
		});
	});

	test("should have initial balance of 5", async () => {
		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Messages].balance;

		expect(balance).toBe(5);
	});

	test("should reject tracking 7 units when balance is 5 (no overage)", async () => {
		const res = await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 7,
			overage_behavior: "reject",
		});

		expect(trackWasSuccessful({ res })).toBe(false);
		expect(res.code).toBe("insufficient_balance");

		// Verify balance remains unchanged
		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Messages].balance;

		expect(balance).toBe(5);
	});

	test("should reflect unchanged balance in non-cached customer after 2s", async () => {
		// Wait 2 seconds for DB sync
		await timeout(2000);

		// Fetch customer with skip_cache=true
		const customer = await autumnV1.customers.get(customerId, {
			skip_cache: "true",
		});
		const balance = customer.features[TestFeature.Messages].balance;

		expect(balance).toBe(5);
	});
});
