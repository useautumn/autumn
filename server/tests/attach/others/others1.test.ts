import { beforeAll, describe, test } from "bun:test";
import { LegacyVersion } from "@autumn/shared";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import {
	expectDowngradeCorrect,
	expectNextCycleCorrect,
} from "@tests/utils/expectUtils/expectScheduleUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "others1";

export const free = constructProduct({
	items: [],
	type: "free",
	isDefault: false,
});

export const pro = constructProduct({
	items: [],
	type: "pro",
	trial: true,
});

export const premium = constructProduct({
	items: [],
	type: "premium",
	trial: true,
});

describe(`${chalk.yellowBright(`${testCase}: Testing trials: pro with trial -> premium with trial -> free`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;

	const curUnix = new Date().getTime();

	beforeAll(async () => {
		const { testClockId: testClockId1 } = await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		await initProductsV0({
			ctx,
			products: [free, pro, premium],
			prefix: testCase,
		});

		testClockId = testClockId1!;
	});

	test("should attach pro product (with trial)", async () => {
		await attachAndExpectCorrect({
			autumn,
			stripeCli: ctx.stripeCli,
			customerId,
			product: pro,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
		});
	});

	test("should attach premium product (with trial)", async () => {
		await attachAndExpectCorrect({
			autumn,
			stripeCli: ctx.stripeCli,
			customerId,
			product: premium,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
		});
	});

	test("should attach free product at the end of the trial", async () => {
		const { preview } = await expectDowngradeCorrect({
			autumn,
			stripeCli: ctx.stripeCli,
			customerId,
			curProduct: premium,
			newProduct: free,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
		});
		expectNextCycleCorrect({
			autumn,
			preview,
			stripeCli: ctx.stripeCli,
			customerId,
			testClockId,
			product: free,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
		});
	});
});
