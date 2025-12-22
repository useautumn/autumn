import { beforeAll, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	type CheckResponseV1,
	type LimitedItem,
	SuccessCode,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { featureToCreditSystem } from "@/internal/features/creditSystemUtils.js";
import { timeout } from "@/utils/genUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const action1Feature = constructFeatureItem({
	featureId: TestFeature.Action1,
	includedUsage: 50,
}) as LimitedItem;

const creditsFeature = constructFeatureItem({
	featureId: TestFeature.Credits,
	includedUsage: 100,
}) as LimitedItem;

const proProd = constructProduct({
	type: "pro",
	isDefault: false,
	items: [action1Feature, creditsFeature],
});

const testCase = "credit-systems3";

describe(`${chalk.yellowBright("credit-systems3: test /check fallback from metered feature to credit system")}`, () => {
	const customerId = "credit-systems3";
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

	test("right after attach, check should return Action1 feature", async () => {
		const requiredAction1Units = 25.5;
		const res = (await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: requiredAction1Units,
		})) as unknown as CheckResponseV1;

		expect(res).toMatchObject({
			allowed: true,
			customer_id: customerId,
			balance: action1Feature.included_usage,
			feature_id: TestFeature.Action1,
			required_balance: requiredAction1Units,
			code: SuccessCode.FeatureFound,
			unlimited: false,
			usage: 0,
			included_usage: action1Feature.included_usage,
			overage_allowed: false,
			interval: "month",
			interval_count: 1,
		});

		expect(res.next_reset_at).toBeDefined();
	});

	test("after consuming Action1, check should return Credits feature", async () => {
		// First, consume all Action1 balance
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: action1Feature.included_usage,
		});
		await timeout(2000);

		// Now check - should fall back to credit system
		const requiredAction1Units = 25.5;
		const res = (await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: requiredAction1Units,
		})) as unknown as CheckResponseV1;

		// Calculate the credit cost for the required Action1 units
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
});
