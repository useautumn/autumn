import { beforeAll, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	type CheckResponse,
	type CheckResponseV0,
	type LimitedItem,
	SuccessCode,
} from "@autumn/shared";
import chalk from "chalk";
import { TestFeature } from "tests/setup/v2Features.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const messagesFeature = constructArrearItem({
	featureId: TestFeature.Messages,
	price: 0.5,
	includedUsage: 100,
	usageLimit: 500,
}) as LimitedItem;

const proProd = constructProduct({
	type: "pro",
	isDefault: false,
	items: [messagesFeature],
});

const testCase = "check7";

describe(`${chalk.yellowBright("check7: test /check on feature with credit system")}`, () => {
	const customerId = "check7";
	const autumnV0: AutumnInt = new AutumnInt({ version: ApiVersion.V0_2 });
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			attachPm: "success",
			withTestClock: false,
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

	test("v0 response", async () => {
		const res = (await autumnV0.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: messagesFeature.usage_limit! + 1,
		})) as unknown as CheckResponseV0;

		expect(res.allowed).toBe(false);
		expect(res.balances).toBeDefined();
		expect(res.balances).toHaveLength(1);
		expect(res.balances[0]).toMatchObject({
			balance: messagesFeature.included_usage,
			required: messagesFeature.usage_limit! + 1,
			feature_id: TestFeature.Messages,
		});
	});

	test("v1 response", async () => {
		const res = (await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: messagesFeature.usage_limit! + 1,
		})) as unknown as CheckResponse;

		const expectedRes = {
			allowed: false,
			customer_id: customerId,
			balance: messagesFeature.included_usage,
			feature_id: TestFeature.Messages as string,
			required_balance: messagesFeature.usage_limit! + 1,
			code: SuccessCode.FeatureFound,
			unlimited: false,
			usage: 0,
			included_usage: messagesFeature.included_usage,
			overage_allowed: false,

			usage_limit: messagesFeature.usage_limit!,
			interval: "month",
			interval_count: 1,
		};

		expect(res).toMatchObject(expectedRes);
		expect(res.next_reset_at).toBeDefined();
	});
});
