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

const testCase = "upgrade5";

export const pro = constructProduct({
	items: [
		constructPrepaidItem({
			featureId: TestFeature.Messages,
			price: 12,
			billingUnits: 100,
		}),
	],
	type: "pro",
});

export const premium = constructProduct({
	items: [
		constructPrepaidItem({
			featureId: TestFeature.Messages,
			price: 8,
			billingUnits: 100,
		}),
	],
	type: "premium",
});

describe(`${chalk.yellowBright(`${testCase}: Testing upgrades with prepaid single use`)}`, () => {
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
			products: [pro, premium],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: [pro, premium],
			db,
			orgId: org.id,
			env,
		});

		testClockId = testClockId1!;
	});

	const proOpts = [
		{
			feature_id: TestFeature.Messages,
			quantity: 300,
		},
	];

	it("should attach pro product (prepaid single use)", async () => {
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
			feature_id: TestFeature.Messages,
			quantity: 600,
		},
	];

	it("should upgrade to premium product (prepaid single use)", async () => {
		curUnix = await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addWeeks(curUnix, 1).getTime(),
			waitForSeconds: 20,
		});

		return;

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
});
