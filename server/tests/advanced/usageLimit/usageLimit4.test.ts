import {
	ErrCode,
	LegacyVersion,
	type LimitedItem,
} from "@autumn/shared";
import { beforeAll, describe, expect, test } from "bun:test";
import chalk from "chalk";
import type Stripe from "stripe";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectAutumnError } from "tests/utils/expectUtils/expectErrUtils.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

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
	let testClockId: string;
	let stripeCli: Stripe;

	const curUnix = new Date().getTime();

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
	test("should attach pro product and update quantity with quantity exceeding usage limit and get an error", async () => {
		await expectAutumnError({
			errCode: ErrCode.InvalidInputs,
			func: async () => {
				await autumn.track({
					customer_id: customerId,
					feature_id: TestFeature.Users,
					value: messageItem.usage_limit! + 1,
				});
			},
		});

		const check = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Users,
		});

		expect(check.balance).toBe(0);
		expect(check.allowed).toBe(true);
	});
});
