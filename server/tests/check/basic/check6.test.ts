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
import {
	constructArrearItem,
	constructFeatureItem,
} from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const monthlyMessages = constructArrearItem({
	featureId: TestFeature.Messages,
	price: 0.5,
	includedUsage: 100,
}) as LimitedItem;

const lifetimeMessages = constructFeatureItem({
	featureId: TestFeature.Messages,
	interval: null,
	includedUsage: 1000,
}) as LimitedItem;

const proProd = constructProduct({
	type: "pro",
	isDefault: false,
	items: [monthlyMessages, lifetimeMessages],
});

const testCase = "check6";

describe(`${chalk.yellowBright("check6: test /check on feature with multiple balances (one off + monthly)")}`, () => {
	const customerId = "check6";
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

		console.log(res);

		expect(res.allowed).toBe(true);
		expect(res.balances).toBeDefined();
		expect(res.balances).toHaveLength(1);
		expect(res.balances[0]).toMatchObject({
			balance: monthlyMessages.included_usage + lifetimeMessages.included_usage,
			feature_id: TestFeature.Messages,
			required: null,
			unlimited: false,
			usage_allowed: true,
		});
	});

	test("v1 response", async () => {
		const res = (await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponse;

		const totalIncludedUsage =
			monthlyMessages.included_usage + lifetimeMessages.included_usage;

		const lifetimeBreakdown = {
			balance: lifetimeMessages.included_usage,
			included_usage: lifetimeMessages.included_usage,
			interval: "lifetime",
			interval_count: 1,
			next_reset_at: null,
			usage: 0,
		};

		const monthlyBreakdown = {
			balance: monthlyMessages.included_usage,
			included_usage: monthlyMessages.included_usage,
			interval: "month",
			interval_count: 1,
			usage: 0,
		};

		const expectedRes = {
			allowed: true,
			customer_id: customerId,
			feature_id: TestFeature.Messages as string,
			required_balance: 1,
			code: SuccessCode.FeatureFound,
			unlimited: false,
			balance: totalIncludedUsage,
			interval: "multiple",
			interval_count: null,
			usage: 0,
			included_usage: totalIncludedUsage,
			overage_allowed: true,
			breakdown: [lifetimeBreakdown, monthlyBreakdown],
		};

		expect(res).toMatchObject(expectedRes);
	});
});
