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
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import {
	featureToCreditSystem,
	getCreditCost,
} from "../../../src/internal/features/creditSystemUtils.js";

const creditsFeature = constructFeatureItem({
	featureId: TestFeature.Credits,
	includedUsage: 100,
}) as LimitedItem;

const proProd = constructProduct({
	type: "pro",
	isDefault: false,
	items: [creditsFeature],
});

const testCase = "credit-systems1";

describe(`${chalk.yellowBright("credit-systems1: test /check on action that uses credit system")}`, () => {
	const customerId = "credit-systems1";
	const autumnV0: AutumnInt = new AutumnInt({ version: ApiVersion.V0_2 });
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	const creditFeature = ctx.features.find((f) => f.id === TestFeature.Credits);

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

	test("v0 response - action1 within credit balance", async () => {
		const requiredAction1Units = 50.75;
		const res = (await autumnV0.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: requiredAction1Units,
		})) as unknown as CheckResponseV0;

		const meteredCost = getCreditCost({
			featureId: TestFeature.Action1,
			creditSystem: creditFeature!,
			amount: requiredAction1Units,
		});

		expect(res.allowed).toBe(true);
		expect(res.balances).toBeDefined();
		expect(res.balances).toHaveLength(1);
		expect(res.balances[0]).toMatchObject({
			balance: creditsFeature.included_usage,
			required: meteredCost,
			feature_id: TestFeature.Credits,
		});
	});

	test("v1 response - action1 within credit balance", async () => {
		const requiredAction1Units = 50.75;
		const res = (await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: requiredAction1Units,
		})) as unknown as CheckResponse;

		const convertedCreditCost = featureToCreditSystem({
			featureId: TestFeature.Action1,
			creditSystem: creditFeature!,
			amount: requiredAction1Units,
		});

		expect(res).toMatchObject({
			allowed: true,
			customer_id: customerId,
			balance: creditsFeature.included_usage,
			feature_id: TestFeature.Credits,
			required_balance: convertedCreditCost,
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

	test("v0 response - action2 exceeds credit balance", async () => {
		const requiredAction2Units = 167.33;
		const res = (await autumnV0.check({
			customer_id: customerId,
			feature_id: TestFeature.Action2,
			required_balance: requiredAction2Units,
		})) as unknown as CheckResponseV0;

		const meteredCost = getCreditCost({
			featureId: TestFeature.Action2,
			creditSystem: creditFeature!,
			amount: requiredAction2Units,
		});

		expect(res.allowed).toBe(false);
		expect(res.balances).toBeDefined();
		expect(res.balances).toHaveLength(1);
		expect(res.balances[0]).toMatchObject({
			balance: creditsFeature.included_usage,
			required: meteredCost,
			feature_id: TestFeature.Credits,
		});
	});

	test("v1 response - action2 exceeds credit balance", async () => {
		const requiredAction2Units = 167.33;
		const res = (await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Action2,
			required_balance: requiredAction2Units,
		})) as unknown as CheckResponse;

		const convertedCreditCost = featureToCreditSystem({
			featureId: TestFeature.Action2,
			creditSystem: creditFeature!,
			amount: requiredAction2Units,
		});

		expect(res).toMatchObject({
			allowed: false,
			customer_id: customerId,
			balance: creditsFeature.included_usage,
			feature_id: TestFeature.Credits,
			required_balance: convertedCreditCost,
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
});
