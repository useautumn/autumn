import { type AppEnv, LegacyVersion, type Organization } from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import { addHours, addMonths, addWeeks } from "date-fns";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { getExpectedInvoiceTotal } from "tests/utils/expectUtils/expectInvoiceUtils.js";
import { createProducts } from "tests/utils/productUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { addPrefixToProducts, replaceItems } from "../utils.js";
import runUpdateEntsTest from "./expectUpdateEnts.js";

const testCase = "updateEnts2";

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

describe(`${chalk.yellowBright(`${testCase}: Testing update ents (changing included usage) for annual plan`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;

	const curUnix = new Date().getTime();
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
			products: [pro],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: [pro],
			db,
			orgId: org.id,
			env,
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

	const newItem = constructArrearItem({
		featureId: TestFeature.Words,
		includedUsage: 5000,
	});

	const customItems = replaceItems({
		items: pro.items,
		featureId: TestFeature.Words,
		newItem,
	});

	const usage = 1200500;

	it("should attach custom pro product", async () => {
		await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addWeeks(curUnix, 2).getTime(),
			waitForSeconds: 30,
		});

		const customProduct = {
			...pro,
			items: customItems,
		};

		await autumn.track({
			customer_id: customerId,
			value: usage,
			feature_id: TestFeature.Words,
		});

		await timeout(5000);

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

	it("should have correct invoice usage next cycle", async () => {
		const invoiceTotal = await getExpectedInvoiceTotal({
			org,
			env,
			customerId,
			productId: pro.id,
			stripeCli,
			db,
			usage: [
				{
					featureId: TestFeature.Words,
					value: usage,
				},
			],
			onlyIncludeMonthly: true,
		});

		let curUnix = Date.now();
		curUnix = await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addMonths(curUnix, 1).getTime(),
		});

		await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addHours(curUnix, hoursToFinalizeInvoice).getTime(),
			waitForSeconds: 10,
		});

		const customer = await autumn.customers.get(customerId);
		const invoice = customer.invoices![0];
		expect(invoice.total).to.equal(
			invoiceTotal,
			"invoice total after 1 cycle should be correct",
		);
	});
});
