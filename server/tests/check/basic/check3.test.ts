import { beforeAll, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	type CheckResponse,
	type CheckResponseV0,
	EntInterval,
	SuccessCode,
} from "@autumn/shared";
import chalk from "chalk";
import { TestFeature } from "tests/setup/v2Features.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const messagesFeature = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 1000,
});

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [messagesFeature],
});

const testCase = "check3";

describe(`${chalk.yellowBright("check3: test /check on metered feature")}`, () => {
	const customerId = "check3";
	const autumnV0: AutumnInt = new AutumnInt({ version: ApiVersion.V0_2 });
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		await initProductsV0({
			ctx,
			products: [freeProd],
			prefix: testCase,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: freeProd.id,
		});
	});

	test("v0 response", async () => {
		const res = (await autumnV0.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV0;

		expect(res).toStrictEqual({
			allowed: true,
			balances: [
				{
					feature_id: TestFeature.Messages,
					required: 1,
					balance: 1000,
				},
			],
		});
	});

	test("v1 response", async () => {
		const res = (await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponse;

		const expectedRes = {
			allowed: true,
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 1,
			code: SuccessCode.FeatureFound,
			interval: EntInterval.Month,
			interval_count: 1,
			unlimited: false,
			balance: 1000,
			usage: 0,
			included_usage: 1000,
			// next_reset_at: 1763833597035,
			overage_allowed: false,
		};

		for (const key in expectedRes) {
			expect(res[key as keyof CheckResponse]).toBe(
				expectedRes[key as keyof typeof expectedRes],
			);
		}
	});
});
