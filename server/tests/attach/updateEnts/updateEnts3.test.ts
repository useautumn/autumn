import { LegacyVersion } from "@autumn/shared";
import { beforeAll, describe, test } from "bun:test";
import chalk from "chalk";
import { addWeeks } from "date-fns";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/internal/products/product-items/productItemUtils.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { replaceItems } from "../utils.js";
import runUpdateEntsTest from "./expectUpdateEnts.js";

const testCase = "updateEnts3";

export const pro = constructProduct({
	items: [
		constructArrearItem({
			featureId: TestFeature.Words,
			includedUsage: 10000,
		}),
	],
	type: "pro",
	isAnnual: true,
});

/**
 * updateEnts2:
 * Testing updating entitlements for annual plans
 * 1. Start with pro annual plan (usage-based)
 * 2. Update included usage amount
 * 3. Verify features and usage are updated correctly
 * 4. Verify invoice total is correct in next billing cycle
 *
 * Verifies that updating entitlements works correctly for annual plans
 * and that usage/billing is calculated properly
 */

describe(`${chalk.yellowBright(`${testCase}: Testing update ents (changing feature items)`)}`, () => {
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
			products: [pro],
			prefix: testCase,
		});

		testClockId = testClockId1!;
	});

	test("should attach pro annual product", async () => {
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

	const newFeatureItem = constructFeatureItem({
		feature_id: TestFeature.Messages,
		included_usage: 500,
	});

	const usage = 1200500;

	const customItems = [...pro.items, newFeatureItem];

	test("should attach custom pro product with new feature item", async () => {
		const customProduct = {
			...pro,
			items: customItems,
		};

		await autumn.track({
			customer_id: customerId,
			value: usage,
			feature_id: TestFeature.Words,
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			advanceTo: addWeeks(curUnix, 2).getTime(),
			waitForSeconds: 10,
		});

		await runUpdateEntsTest({
			autumn,
			stripeCli: ctx.stripeCli,
			customerId,
			customProduct,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			customItems,
			usage: [
				{
					featureId: TestFeature.Words,
					value: usage,
				},
			],
		});
	});

	test("should attach custom pro product with updated feature item", async () => {
		const customItems2 = replaceItems({
			items: customItems,
			featureId: TestFeature.Messages,
			newItem: constructFeatureItem({
				feature_id: TestFeature.Messages,
				included_usage: 1000,
			}),
		});

		const customProduct = {
			...pro,
			items: customItems2,
		};

		await runUpdateEntsTest({
			autumn,
			stripeCli: ctx.stripeCli,
			customerId,
			customProduct,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			customItems: customItems2,
			usage: [
				{
					featureId: TestFeature.Words,
					value: usage,
				},
			],
		});
	});

	test("should attach custom pro product with removed feature item", async () => {
		const customItems2 = customItems.filter(
			(item) => item.feature_id != TestFeature.Messages,
		);

		const customProduct = {
			...pro,
			items: customItems2,
		};

		await runUpdateEntsTest({
			autumn,
			stripeCli: ctx.stripeCli,
			customerId,
			customProduct,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			customItems: customItems2,
			usage: [
				{
					featureId: TestFeature.Words,
					value: usage,
				},
			],
		});
	});
});
