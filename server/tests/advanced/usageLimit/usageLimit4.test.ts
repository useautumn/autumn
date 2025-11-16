import { beforeAll, describe, test } from "bun:test";
import { ErrCode, LegacyVersion, type LimitedItem } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { expectAutumnError } from "../../utils/expectUtils/expectErrUtils";

const messageItem = constructArrearProratedItem({
	featureId: TestFeature.Users,
	includedUsage: 1,
	pricePerUnit: 10,
	usageLimit: 3,
}) as LimitedItem;

export const pro = constructProduct({
	items: [messageItem],
	type: "pro",
});

const testCase = "usageLimit4";

describe(`${chalk.yellowBright(`${testCase}: Testing usage limits for cont use item`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [pro],
			prefix: testCase,
			customerId,
		});

		await initCustomerV3({
			ctx,
			customerId,
			attachPm: "success",
			withTestClock: true,
		});
	});

	test("should attach pro product with quantity exceeding usage limit and get an error", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
		});
	});

	test("should track usage exceeding usage limit and get an error (for paid-allocated can't track if usage limit is exceeded)", async () => {
		await expectAutumnError({
			errCode: ErrCode.InsufficientBalance,
			func: async () => {
				await autumn.track({
					customer_id: customerId,
					feature_id: TestFeature.Users,
					value: messageItem.usage_limit! + 1,
				});
			},
		});
	});
});
