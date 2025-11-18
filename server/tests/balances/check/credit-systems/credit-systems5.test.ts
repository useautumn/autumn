import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

// const creditsFeature = constructFeatureItem({
// 	featureId: TestFeature.Credits,
// 	includedUsage: 1000,
// });
const actionFeature = constructArrearItem({
	featureId: TestFeature.Action1,
	includedUsage: 0,
});

const proProd = constructProduct({
	type: "pro",
	isDefault: false,
	items: [actionFeature],
});

const testCase = "credit-systems5";
const customerId = "credit-systems5";

describe(`${chalk.yellowBright("credit-systems5: test check works with main feature in credit system (usage allowed true)")}`, () => {
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
			products: [proProd],
			prefix: testCase,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: proProd.id,
		});
	});

	test("should allow check when feature has usage allowed true and part of a credit system", async () => {
		const checkResult = await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: 1,
		});

		expect(checkResult.allowed).toBe(true);
	});
});
