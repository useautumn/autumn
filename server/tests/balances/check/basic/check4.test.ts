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

const messagesFeature = constructFeatureItem({
	featureId: TestFeature.Messages,
	unlimited: true,
});

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [messagesFeature],
});

const testCase = "check4";

describe(`${chalk.yellowBright("check4: test /check on unlimited feature")}`, () => {
	const customerId = "check4";
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
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(res).toEqual({
			allowed: true,
			customer_id: "check4",
			required_balance: 1,
			balance: {
				feature_id: "messages",
				unlimited: true,
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
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV1;

		const expectedRes = {
			allowed: true,
			customer_id: customerId,
			feature_id: TestFeature.Messages as string,
			required_balance: 1,
			code: SuccessCode.FeatureFound,
			unlimited: true,
			usage: 0,
			included_usage: 0,
			next_reset_at: null,
			overage_allowed: false,

			// Unlimited features, balance is 0...
			balance: 0,
			interval: null,
			interval_count: null,
		};

		expect(expectedRes).toMatchObject(res);
	});

	test("v0 response", async () => {
		const res = (await autumnV0.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV0;

		expect(res.allowed).toBe(true);
		expect(res.balances).toBeDefined();
		expect(res.balances).toHaveLength(1);
		expect(res.balances[0]).toStrictEqual({
			balance: null,
			feature_id: TestFeature.Messages,
			unlimited: true,
			usage_allowed: false,
			required: null,
		});
	});
});
