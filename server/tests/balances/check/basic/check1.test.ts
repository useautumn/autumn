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

const testCase = "check1";

describe(`${chalk.yellowBright("check1: test /check when no feature attached")}`, () => {
	const customerId = "check1";
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
	});

	test("should have correct check response when feature not attached (v1)", async () => {
		const res = (await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponse;

		expect(res).toStrictEqual({
			allowed: false,
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 1,
			code: SuccessCode.FeatureFound,
		});
	});

	test("should have correct check response when feature not attached (v0)", async () => {
		const res = (await autumnV0.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV0;

		expect(res.allowed).toBe(false);
		expect(res.balances).toBeDefined();
		expect(res.balances).toHaveLength(0);
	});
});
