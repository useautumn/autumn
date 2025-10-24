import { beforeAll, describe, test } from "bun:test";
import { type AppEnv, LegacyVersion, type Organization } from "@autumn/shared";
import chalk from "chalk";
import type Stripe from "stripe";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "upgrade7";

export const pro = constructProduct({
	items: [],
	type: "pro",
});

export const premium = constructProduct({
	items: [],
	type: "premium",
});

describe(`${chalk.yellowBright(`${testCase}: Testing upgrade via cancel + attach`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;

	beforeAll(async () => {
		db = ctx.db;
		org = ctx.org;
		env = ctx.env;
		stripeCli = ctx.stripeCli;

		const { testClockId: testClockId1 } = await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		await initProductsV0({
			ctx,
			products: [pro, premium],
			prefix: testCase,
		});

		testClockId = testClockId1!;
	});

	test("should attach pro product", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli,
			db,
			org,
			env,
		});
	});

	test("should cancel than attach premium product", async () => {
		await autumn.cancel({
			customer_id: customerId,
			product_id: pro.id,
			cancel_immediately: true,
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: premium.id,
			force_checkout: true,
		});
	});
});
