import { beforeAll, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	type CheckResponse,
	type CheckResponseV0,
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

const dashboardFeature = constructFeatureItem({
	featureId: TestFeature.Dashboard,
	isBoolean: true,
});

const messagesFeature = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 1000,
});

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [dashboardFeature, messagesFeature],
});

const testCase = "check2";

describe(`${chalk.yellowBright("check2: test /check on boolean feature")}`, () => {
	const customerId = "check2";
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
			feature_id: TestFeature.Dashboard,
		})) as unknown as CheckResponseV0;

		expect(res).toStrictEqual({
			allowed: true,
			balances: [
				{
					feature_id: TestFeature.Dashboard,
					balance: null,
				},
			],
		});

		// expect(res.allowed).toBe(true);
		// expect(res.balances).toBeDefined();
		// expect(res.balances).toHaveLength(1);
		// expect(res.balances[0]).toStrictEqual({
		// 	feature_id: TestFeature.Dashboard,
		// 	balance: null,
		// });
	});

	test("v1 response", async () => {
		const res = (await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Dashboard,
		})) as unknown as CheckResponse;

		expect(res).toStrictEqual({
			customer_id: customerId,
			feature_id: TestFeature.Dashboard,
			code: SuccessCode.FeatureFound,
			allowed: true,

			// New fields for boolean?
			interval: null,
			balance: 0,
			included_usage: 0,
			usage: 0,
			next_reset_at: null,
			overage_allowed: false,
			required_balance: 1,
			unlimited: false,
		});
	});
});
