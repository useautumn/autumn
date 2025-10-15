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
import { timeout } from "@/utils/genUtils.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { addPrefixToProducts } from "../utils.js";

const testCase = "upgrade3";

export const pro = constructProduct({
	items: [
		constructArrearProratedItem({
			featureId: TestFeature.Users,
			pricePerUnit: 12,
		}),
	],
	type: "pro",
});

export const premium = constructProduct({
	items: [
		constructArrearProratedItem({
			featureId: TestFeature.Users,
			pricePerUnit: 20,
		}),
	],
	type: "premium",
});

export const proAnnual = constructProduct({
	items: [
		constructArrearProratedItem({
			featureId: TestFeature.Users,
			pricePerUnit: 12,
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

describe(`${chalk.yellowBright(`${testCase}: Testing upgrades with arrear prorated`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;

	let curUnix = new Date().getTime();
	let numUsers = 0;

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

	it("should attach pro product (arrear prorated)", async () => {
		// 1. Create multiple entities
		const entities = await autumn.entities.create(customerId, [
			{
				id: "entity1",
				name: "entity1",
				feature_id: TestFeature.Users,
			},
			{
				id: "entity2",
				name: "entity2",
				feature_id: TestFeature.Users,
			},
		]);
		numUsers = 2;

		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli,
			db,
			org,
			env,
			usage: [
				{
					featureId: TestFeature.Users,
					value: 2,
				},
			],
		});
	});

	it("should create entity, then upgrade to premium product (arrear prorated)", async () => {
		curUnix = await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addWeeks(curUnix, 1).getTime(),
		});

		// TODO: Check price paid for entity3
		await autumn.entities.create(customerId, [
			{
				id: "entity3",
				name: "entity3",
				feature_id: TestFeature.Users,
			},
		]);
		numUsers += 1;

		await timeout(3000);

		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: premium,
			stripeCli,
			db,
			org,
			env,
			usage: [
				{
					featureId: TestFeature.Users,
					value: numUsers,
				},
			],
		});
	});

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
			usage: [
				{
					featureId: TestFeature.Users,
					value: numUsers,
				},
			],
		});
	});
});
