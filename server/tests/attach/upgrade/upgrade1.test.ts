import { beforeAll, describe, test } from "bun:test";
import { type AppEnv, LegacyVersion, type Organization } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import type { Stripe } from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

// UNCOMMENT FROM HERE
const pro = constructProduct({
	id: "pro",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "pro",
});
const premium = constructProduct({
	id: "premium",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "premium",
});
const growth = constructProduct({
	id: "growth",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "growth",
});

describe(`${chalk.yellowBright("upgrade1: Testing usage upgrades")}`, () => {
	const customerId = "upgrade1";
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	let stripeCli: Stripe;
	let testClockId: string;
	let curUnix: number;
	let db: DrizzleCli;
	let org: Organization;
	let env: AppEnv;

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
			products: [pro, premium, growth],
			prefix: customerId,
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

	test("should attach premium product", async () => {
		const wordsUsage = 100000;
		await timeout(4000);
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Words,
			value: wordsUsage,
		});

		// curUnix = await advanceTestClock({
		// 	stripeCli,
		// 	testClockId,
		// 	advanceTo: addWeeks(new Date(), 2).getTime(),
		// 	waitForSeconds: 10,
		// });

		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: premium,
			stripeCli,
			db,
			org,
			env,
		});

		await timeout(2000);
	});

	test("should attach growth product", async () => {
		const wordsUsage = 200000;
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Words,
			value: wordsUsage,
		});

		curUnix = await advanceTestClock({
			stripeCli,
			testClockId,
			numberOfWeeks: 1,
			waitForSeconds: 30,
		});

		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: growth,
			stripeCli,
			db,
			org,
			env,
		});
	});
});
