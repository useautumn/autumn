import { type AppEnv, LegacyVersion, type Organization } from "@autumn/shared";
import chalk from "chalk";
import { addWeeks } from "date-fns";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { createProducts } from "tests/utils/productUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { addPrefixToProducts } from "../utils.js";

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

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		const { testClockId: testClockId1 } = await initCustomer({
			autumn: autumnJs,
			customerId,
			db,
			org,
			env,
			attachPm: "success",
		});

		addPrefixToProducts({
			products: [pro, premium, proAnnual],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: [pro, premium, proAnnual],
			db,
			orgId: org.id,
			env,
		});

		testClockId = testClockId1!;
	});

	const proOpts = [
		{
			feature_id: TestFeature.Users,
			quantity: 4,
		},
	];

	it("should attach pro product (arrear prorated)", async () => {
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

	it("should create entity, then upgrade to premium product (arrear prorated)", async () => {
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

	it("should upgrade to pro-annual product (arrear prorated)", async () => {
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
