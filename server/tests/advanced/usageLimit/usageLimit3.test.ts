import { beforeAll, describe, test } from "bun:test";
import { ErrCode, LegacyVersion, type LimitedItem } from "@autumn/shared";
import chalk from "chalk";
import type Stripe from "stripe";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const messageItem = constructPrepaidItem({
	featureId: TestFeature.Messages,
	includedUsage: 50,
	billingUnits: 100,
	price: 8,
	usageLimit: 500,
}) as LimitedItem;

export const pro = constructProduct({
	items: [messageItem],
	type: "pro",
});

// const addOnMessages = constructFeatureItem({
//   featureId: TestFeature.Messages,
//   interval: null,
//   includedUsage: 250,
// }) as LimitedItem;

// const messageAddOn = constructProduct({
//   type: "one_off",
//   items: [addOnMessages],
// });

const testCase = "usageLimit3";

describe(`${chalk.yellowBright(`${testCase}: Testing usage limits for prepaid`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;
	let stripeCli: Stripe;

	beforeAll(async () => {
		stripeCli = ctx.stripeCli;

		await initProductsV0({
			ctx,
			products: [pro],
			prefix: testCase,
			customerId,
		});

		const { testClockId: testClockId1 } = await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		testClockId = testClockId1!;
	});

	test("should attach pro product with quantity exceeding usage limit and get an error", async () => {
		expectAutumnError({
			func: async () => {
				return await attachAndExpectCorrect({
					autumn,
					customerId,
					product: pro,
					stripeCli: ctx.stripeCli,
					db: ctx.db,
					org: ctx.org,
					env: ctx.env,
					options: [
						{
							feature_id: TestFeature.Messages,
							quantity: 600,
						},
					],
				});
			},
		});
	});
	test("should attach pro product and update quantity with quantity exceeding usage limit and get an error", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 100,
				},
			],
		});

		expectAutumnError({
			errCode: ErrCode.InvalidOptions,
			func: async () => {
				return await attachAndExpectCorrect({
					autumn,
					customerId,
					product: pro,
					stripeCli: ctx.stripeCli,
					db: ctx.db,
					org: ctx.org,
					env: ctx.env,
					options: [
						{
							feature_id: TestFeature.Messages,
							quantity: 600,
						},
					],
				});
			},
		});
	});
});
