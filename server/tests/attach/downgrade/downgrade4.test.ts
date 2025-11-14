import { beforeAll, describe, test } from "bun:test";
import {
	type AppEnv,
	BillingInterval,
	LegacyVersion,
	type Organization,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import {
	expectDowngradeCorrect,
	expectNextCycleCorrect,
} from "@tests/utils/expectUtils/expectScheduleUtils.js";
import { advanceMonths } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "downgrade4";

const proQuarter = constructProduct({
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "pro",
	interval: BillingInterval.Quarter,
});

const pro = constructProduct({
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "pro",
});

const premium = constructProduct({
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "premium",
});

describe(`${chalk.yellowBright(`${testCase}: Testing downgrade: pro-quarter -> premium -> pro`)}`, () => {
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
			products: [proQuarter, pro, premium],
			prefix: testCase,
		});

		testClockId = testClockId1!;
	});

	test("should attach pro quarterly product", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: proQuarter,
			stripeCli,
			db,
			org,
			env,
		});
	});

	test("should downgrade to premium", async () => {
		await expectDowngradeCorrect({
			autumn,
			customerId,
			curProduct: proQuarter,
			newProduct: premium,
			stripeCli,
			db,
			org,
			env,
		});
	});

	let preview = null;

	test("should downgrade to pro", async () => {
		const { preview: preview_ } = await expectDowngradeCorrect({
			autumn,
			customerId,
			curProduct: proQuarter,
			newProduct: pro,
			stripeCli,
			db,
			org,
			env,
		});

		preview = preview_;
	});

	test("should have correct invoice after cycle", async () => {
		await advanceMonths({ stripeCli, testClockId, numberOfMonths: 3 });

		await timeout(10000);

		await expectNextCycleCorrect({
			preview: preview!,
			autumn,
			stripeCli,
			customerId,
			testClockId,
			product: pro,
			db,
			org,
			env,
		});
	});

	return;
});
