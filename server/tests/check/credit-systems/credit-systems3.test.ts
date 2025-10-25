// import { beforeAll, describe, expect, test } from "bun:test";
// import {
// 	ApiVersion,
// 	type CheckResponse,
// 	type CheckResponseV0,
// 	type LimitedItem,
// 	SuccessCode,
// } from "@autumn/shared";
// import chalk from "chalk";
// import { TestFeature } from "tests/setup/v2Features.js";
// import ctx from "tests/utils/testInitUtils/createTestContext.js";
// import { AutumnInt } from "@/external/autumn/autumnCli.js";
// import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
// import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
// import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
// import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
// import {
// 	featureToCreditSystem,
// 	getCreditCost,
// } from "../../../src/internal/features/creditSystemUtils.js";

// const action1Feature = constructFeatureItem({
// 	featureId: TestFeature.Action1,
// 	includedUsage: 50,
// }) as LimitedItem;

// const creditsFeature = constructFeatureItem({
// 	featureId: TestFeature.Credits,
// 	includedUsage: 100,
// }) as LimitedItem;

// const proProd = constructProduct({
// 	type: "pro",
// 	isDefault: false,
// 	items: [action1Feature, creditsFeature],
// });

// const testCase = "credit-systems3";

// describe(`${chalk.yellowBright("credit-systems3: test /check fallback from metered feature to credit system")}`, () => {
// 	const customerId = "credit-systems3";
// 	const autumnV0: AutumnInt = new AutumnInt({ version: ApiVersion.V0_2 });
// 	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });
// 	const creditFeature = ctx.features.find((f) => f.id === TestFeature.Credits);

// 	beforeAll(async () => {
// 		await initCustomerV3({
// 			ctx,
// 			customerId,
// 			attachPm: "success",
// 			withTestClock: false,
// 		});

// 		await initProductsV0({
// 			ctx,
// 			products: [proProd],
// 			prefix: testCase,
// 		});

// 		await autumnV1.attach({
// 			customer_id: customerId,
// 			product_id: proProd.id,
// 		});
// 	});

// 	test("v0 response - before consuming metered feature, returns Action1", async () => {
// 		const requiredAction1Units = 25.5;
// 		const res = (await autumnV0.check({
// 			customer_id: customerId,
// 			feature_id: TestFeature.Action1,
// 			required_balance: requiredAction1Units,
// 		})) as unknown as CheckResponseV0;

// 		expect(res).toMatchObject({
// 			allowed: true,
// 			balances: [
// 				{
// 					balance: action1Feature.included_usage,
// 					required: requiredAction1Units,
// 					feature_id: TestFeature.Action1,
// 				},
// 			],
// 		});
// 	});

// 	test("v1 response - before consuming metered feature, returns Action1", async () => {
// 		const requiredAction1Units = 25.5;
// 		const res = (await autumnV1.check({
// 			customer_id: customerId,
// 			feature_id: TestFeature.Action1,
// 			required_balance: requiredAction1Units,
// 		})) as unknown as CheckResponse;

// 		expect(res).toMatchObject({
// 			allowed: true,
// 			customer_id: customerId,
// 			balance: action1Feature.included_usage,
// 			feature_id: TestFeature.Action1,
// 			required_balance: requiredAction1Units,
// 			code: SuccessCode.FeatureFound,
// 			unlimited: false,
// 			usage: 0,
// 			included_usage: action1Feature.included_usage,
// 			overage_allowed: false,
// 			interval: "month",
// 			interval_count: 1,
// 		});

// 		expect(res.next_reset_at).toBeDefined();
// 	});
// 	return;

// 	test("consume all Action1 balance", async () => {
// 		await autumnV1.track({
// 			customer_id: customerId,
// 			feature_id: TestFeature.Action1,
// 			value: action1Feature.included_usage,
// 		});
// 	});

// 	test("v0 response - after consuming metered feature, returns Credits", async () => {
// 		const requiredAction1Units = 25.5;
// 		const res = (await autumnV0.check({
// 			customer_id: customerId,
// 			feature_id: TestFeature.Action1,
// 			required_balance: requiredAction1Units,
// 		})) as unknown as CheckResponseV0;

// 		const creditFeature = ctx.features.find(
// 			(f) => f.id === TestFeature.Credits,
// 		);

// 		const meteredCost = getCreditCost({
// 			featureId: TestFeature.Action1,
// 			creditSystem: creditFeature!,
// 			amount: requiredAction1Units,
// 		});

// 		expect(res.allowed).toBe(true);
// 		expect(res.balances).toBeDefined();
// 		expect(res.balances).toHaveLength(1);
// 		expect(res.balances[0]).toMatchObject({
// 			balance: creditsFeature.included_usage,
// 			required: meteredCost,
// 			feature_id: TestFeature.Credits,
// 		});
// 	});

// 	test("v1 response - after consuming metered feature, returns Credits", async () => {
// 		const requiredAction1Units = 25.5;
// 		const res = (await autumnV1.check({
// 			customer_id: customerId,
// 			feature_id: TestFeature.Action1,
// 			required_balance: requiredAction1Units,
// 		})) as unknown as CheckResponse;

// 		const creditFeature = ctx.features.find(
// 			(f) => f.id === TestFeature.Credits,
// 		);

// 		const convertedCreditCost = featureToCreditSystem({
// 			featureId: TestFeature.Action1,
// 			creditSystem: creditFeature!,
// 			amount: requiredAction1Units,
// 		});

// 		expect(res).toMatchObject({
// 			allowed: true,
// 			customer_id: customerId,
// 			balance: creditsFeature.included_usage,
// 			feature_id: TestFeature.Credits,
// 			required_balance: convertedCreditCost,
// 			code: SuccessCode.FeatureFound,
// 			unlimited: false,
// 			usage: action1Feature.included_usage,
// 			included_usage: creditsFeature.included_usage,
// 			overage_allowed: false,
// 			interval: "month",
// 			interval_count: 1,
// 		});

// 		expect(res.next_reset_at).toBeDefined();
// 	});
// });
