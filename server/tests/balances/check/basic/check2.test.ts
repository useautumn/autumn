import { beforeAll, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	type CheckResponseV0,
	type CheckResponseV1,
	type CheckResponseV2,
	SuccessCode,
} from "@autumn/shared";
import chalk from "chalk";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
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
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

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

	test("v2 response", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Dashboard,
		})) as unknown as CheckResponseV2;

		expect(res).toEqual({
			allowed: true,
			customer_id: customerId,
			required_balance: 1,
			balance: {
				feature_id: TestFeature.Dashboard,
				unlimited: false,
				granted_balance: 0,
				purchased_balance: 0,
				current_balance: 0,
				usage: 0,
				max_purchase: 0,
				overage_allowed: false,
			},
		});
	});

	test("v1 response", async () => {
		const res = (await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Dashboard,
		})) as unknown as CheckResponseV1;

		expect(res).toStrictEqual({
			customer_id: customerId,
			feature_id: TestFeature.Dashboard,
			code: SuccessCode.FeatureFound,
			allowed: true,

			// New fields for boolean?
			interval: null,
			interval_count: null,
			balance: 0,
			included_usage: 0,
			usage: 0,
			next_reset_at: null,
			overage_allowed: false,
			required_balance: 1,
			unlimited: false,
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
	});
});
