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
import { constructFeatureItem } from "@/internal/products/product-items/productItemUtils.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { addPrefixToProducts, replaceItems } from "../utils.js";
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
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;

	const curUnix = new Date().getTime();

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
			products: [pro],
			prefix: testCase,
		});

		await createProducts({
			db,
			orgId: org.id,
			env,
			autumn,
			products: [pro],
		});

		testClockId = testClockId1!;
	});

	it("should attach pro annual product", async () => {
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

	const newFeatureItem = constructFeatureItem({
		feature_id: TestFeature.Messages,
		included_usage: 500,
	});

	const usage = 1200500;

	const customItems = [...pro.items, newFeatureItem];

	it("should attach custom pro product with new feature item", async () => {
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
			stripeCli,
			testClockId,
			advanceTo: addWeeks(curUnix, 2).getTime(),
			waitForSeconds: 10,
		});

		await runUpdateEntsTest({
			autumn,
			stripeCli,
			customerId,
			customProduct,
			db,
			org,
			env,
			customItems,
			usage: [
				{
					featureId: TestFeature.Words,
					value: usage,
				},
			],
		});
	});

	it("should attach custom pro product with updated feature item", async () => {
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
			stripeCli,
			customerId,
			customProduct,
			db,
			org,
			env,
			customItems: customItems2,
			usage: [
				{
					featureId: TestFeature.Words,
					value: usage,
				},
			],
		});
	});

	it("should attach custom pro product with removed feature item", async () => {
		const customItems2 = customItems.filter(
			(item) => item.feature_id != TestFeature.Messages,
		);

		const customProduct = {
			...pro,
			items: customItems2,
		};

		await runUpdateEntsTest({
			autumn,
			stripeCli,
			customerId,
			customProduct,
			db,
			org,
			env,
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
