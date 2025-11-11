import { beforeAll, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	type CheckResponseV0,
	type CheckResponseV1,
	type LimitedItem,
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

const creditsFeature = constructFeatureItem({
	featureId: TestFeature.Credits,
	includedUsage: 100,
}) as LimitedItem;

const proProd = constructProduct({
	type: "pro",
	isDefault: false,
	items: [creditsFeature],
});

const testCase = "credit-systems2";

describe(`${chalk.yellowBright("credit-systems2: test /check on credit system feature")}`, () => {
	const customerId = "credit-systems2";
	const autumnV0: AutumnInt = new AutumnInt({ version: ApiVersion.V0_2 });
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

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

	test("v1 response - within balance", async () => {
		const requiredCredits = 50.25;
		const res = (await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			required_balance: requiredCredits,
		})) as unknown as CheckResponseV1;

		expect(res).toMatchObject({
			allowed: true,
			customer_id: customerId,
			balance: creditsFeature.included_usage,
			feature_id: TestFeature.Credits,
			required_balance: requiredCredits,
			code: SuccessCode.FeatureFound,
			unlimited: false,
			usage: 0,
			included_usage: creditsFeature.included_usage,
			overage_allowed: false,
			interval: "month",
			interval_count: 1,
		});

		expect(res.next_reset_at).toBeDefined();
	});

	test("v1 response - exceeds balance", async () => {
		const requiredCredits = 100.5;
		const res = (await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			required_balance: requiredCredits,
		})) as unknown as CheckResponseV1;

		expect(res).toMatchObject({
			allowed: false,
			customer_id: customerId,
			balance: creditsFeature.included_usage,
			feature_id: TestFeature.Credits,
			required_balance: requiredCredits,
			code: SuccessCode.FeatureFound,
			unlimited: false,
			usage: 0,
			included_usage: creditsFeature.included_usage,
			overage_allowed: false,
			interval: "month",
			interval_count: 1,
		});

		expect(res.next_reset_at).toBeDefined();
	});

	test("v0 response - within balance", async () => {
		const requiredCredits = 50.25;
		const res = (await autumnV0.check({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			required_balance: requiredCredits,
		})) as unknown as CheckResponseV0;

		expect(res.allowed).toBe(true);
		expect(res.balances).toBeDefined();
		expect(res.balances).toHaveLength(1);
		expect(res.balances[0]).toMatchObject({
			balance: creditsFeature.included_usage,
			required: requiredCredits,
			feature_id: TestFeature.Credits,
		});
	});

	test("v0 response - exceeds balance", async () => {
		const requiredCredits = 100.5;
		const res = (await autumnV0.check({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			required_balance: requiredCredits,
		})) as unknown as CheckResponseV0;

		expect(res.allowed).toBe(false);
		expect(res.balances).toBeDefined();
		expect(res.balances).toHaveLength(1);
		expect(res.balances[0]).toMatchObject({
			balance: creditsFeature.included_usage,
			required: requiredCredits,
			feature_id: TestFeature.Credits,
		});
	});
});
