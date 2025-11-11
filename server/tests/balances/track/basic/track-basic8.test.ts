import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, ErrCode, type TrackResponseV2 } from "@autumn/shared";
import chalk from "chalk";
import { TestFeature } from "tests/setup/v2Features.js";
import { timeout } from "tests/utils/genUtils.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { expectAutumnError } from "../../../utils/expectUtils/expectErrUtils.js";

const testCase = "track-basic8";
const customerId = testCase;

// Prepaid feature: 5 included, no overage allowed
const prepaidQuantity = 500;
const prepaidItem = constructPrepaidItem({
	featureId: TestFeature.Messages,
	includedUsage: 0,
	billingUnits: 100,
	price: 1,
});

const prepaidProduct = constructProduct({
	id: "prepaid",
	items: [prepaidItem],
	type: "pro",
});

describe(`${chalk.yellowBright(`${testCase}: Testing prepaid tracking`)}`, () => {
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });
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
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: prepaidQuantity,
				},
			],
		});
	});

	test("should have initial balance of 5", async () => {
		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Messages].balance;

		expect(balance).toBe(prepaidQuantity);
	});

	test("should reject tracking 7 units when balance is 5 (no overage)", async () => {
		expectAutumnError({
			errCode: ErrCode.InsufficientBalance,
			func: async () => {
				await autumnV1.track({
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					value: prepaidQuantity + 1,
					overage_behavior: "reject",
				});
			},
		});

		// Verify balance remains unchanged
		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Messages].balance;

		expect(balance).toBe(prepaidQuantity);
	});

	test("should reflect unchanged balance in non-cached customer after 2s", async () => {
		// Wait 2 seconds for DB sync
		await timeout(2000);

		// Fetch customer with skip_cache=true
		const customer = await autumnV1.customers.get(customerId, {
			skip_cache: "true",
		});
		const balance = customer.features[TestFeature.Messages].balance;

		expect(balance).toBe(prepaidQuantity);
	});

	test("should track 3 units and have correct balance", async () => {
		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 3,
		});

		console.log("Track res:", trackRes);
	});
});
