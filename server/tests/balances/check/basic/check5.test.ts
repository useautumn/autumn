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
}) as LimitedItem;

const proProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [messagesFeature],
});

const testCase = "check5";

describe(`${chalk.yellowBright("check5: test /check on usage-based feature")}`, () => {
	const customerId = "check5";
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
		})) as unknown as CheckResponseV0;

		expect(res.allowed).toBe(true);
		expect(res.balances).toBeDefined();
		expect(res.balances).toHaveLength(1);
		expect(res.balances[0]).toMatchObject({
			balance: messagesFeature.included_usage,
			feature_id: TestFeature.Messages,
			unlimited: false,
			usage_allowed: true,
			required: null,
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
			feature_id: TestFeature.Messages as string,
			required_balance: 1,
			code: SuccessCode.FeatureFound,
			unlimited: false,
			balance: messagesFeature.included_usage,
			usage: 0,
			included_usage: messagesFeature.included_usage,
			overage_allowed: true,
			interval: messagesFeature.interval,
			interval_count: 1,
		};

		expect(res).toMatchObject(expectedRes);
		expect(res.next_reset_at).toBeDefined();
	});
});
