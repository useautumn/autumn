import { beforeAll, describe, test } from "bun:test";
import { type AppEnv, LegacyVersion, type Organization } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { addWeeks } from "date-fns";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "upgrade3";

const pro = constructProduct({
	items: [
		constructArrearProratedItem({
			featureId: TestFeature.Users,
			pricePerUnit: 12,
		}),
	],
	type: "pro",
});

const premium = constructProduct({
	items: [
		constructArrearProratedItem({
			featureId: TestFeature.Users,
			pricePerUnit: 20,
		}),
	],
	type: "premium",
});

const proAnnual = constructProduct({
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

	test("should attach pro product (arrear prorated)", async () => {
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

	test("should create entity, then upgrade to premium product (arrear prorated)", async () => {
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
			usage: [
				{
					featureId: TestFeature.Users,
					value: numUsers,
				},
			],
		});
	});
});
