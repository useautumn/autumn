import { beforeAll, describe, test } from "bun:test";
import { type AppEnv, LegacyVersion, type Organization } from "@autumn/shared";
import chalk from "chalk";
import { addWeeks } from "date-fns";
import type Stripe from "stripe";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "upgrade4";

export const pro = constructProduct({
	items: [
		constructPrepaidItem({
			featureId: TestFeature.Users,
			price: 12,
			billingUnits: 1,
		}),
	],
	type: "pro",
});

export const premium = constructProduct({
	items: [
		constructPrepaidItem({
			featureId: TestFeature.Users,
			price: 20,
			billingUnits: 1,
		}),
	],
	type: "premium",
});

export const proAnnual = constructProduct({
	items: [
		constructPrepaidItem({
			featureId: TestFeature.Users,
			price: 12,
			billingUnits: 1,
		}),
	],
	type: "pro",
	isAnnual: true,
});

/**
 * upgrade3:
 * Testing upgrades for arrear prorated
 * 1. Start with pro monthly plan (usage-based)
 * 2. Upgrade to pro annual plan (usage-based)
 * 3. Upgrade to premium annual plan (usage-based)
 *
 * Verifies subscription items and anchors are correct after each upgrade
 * with arrear prorated billing
 */

describe(`${chalk.yellowBright(`${testCase}: Testing upgrades with prepaid continuous use`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;

	let curUnix = new Date().getTime();
	const numUsers = 0;

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
			products: [pro, premium, proAnnual],
			prefix: testCase,
		});

		testClockId = testClockId1!;
	});

	const proOpts = [
		{
			feature_id: TestFeature.Users,
			quantity: 4,
		},
	];

	test("should attach pro product (arrear prorated)", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli,
			db,
			org,
			env,
			options: proOpts,
		});
	});

	const premiumOpts = [
		{
			feature_id: TestFeature.Users,
			quantity: 6,
		},
	];

	test("should create entity, then upgrade to premium product (arrear prorated)", async () => {
		curUnix = await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addWeeks(curUnix, 1).getTime(),
		});

		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: premium,
			stripeCli,
			db,
			org,
			env,
			options: premiumOpts,
		});
	});

	const proAnnualOpts = [
		{
			feature_id: TestFeature.Users,
			quantity: 3,
		},
	];

	test("should upgrade to pro-annual product (arrear prorated)", async () => {
		curUnix = await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addWeeks(curUnix, 1).getTime(),
		});

		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: proAnnual,
			stripeCli,
			db,
			org,
			env,
			options: proAnnualOpts,
		});
	});
});
