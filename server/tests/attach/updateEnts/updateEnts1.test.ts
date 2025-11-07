import { LegacyVersion } from "@autumn/shared";
import { beforeAll, describe, expect, test } from "bun:test";
import chalk from "chalk";
import { addHours, addMonths } from "date-fns";
import type Stripe from "stripe";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { getExpectedInvoiceTotal } from "tests/utils/expectUtils/expectInvoiceUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { replaceItems } from "../utils.js";
import runUpdateEntsTest from "./expectUpdateEnts.js";

const testCase = "updateEnts1";

export const pro = constructProduct({
	items: [
		constructArrearItem({
			featureId: TestFeature.Words,
			includedUsage: 10000,
		}),
	],
	type: "pro",
});

describe(`${chalk.yellowBright(`${testCase}: Testing update ents (changing included usage)`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;

	const curUnix = new Date().getTime();
	const numUsers = 0;

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [pro],
			prefix: testCase,
			customerId,
		});

		const { testClockId: testClockId1 } = await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		testClockId = testClockId1!;
	});

	test("should attach pro product", async () => {
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

	const newItem = constructArrearItem({
		featureId: TestFeature.Words,
		includedUsage: 20000,
	});

	const customItems = replaceItems({
		items: pro.items,
		featureId: TestFeature.Words,
		newItem,
	});

	const usage = 50000;
	const overage = 50000 - (newItem.included_usage as number);

	test("should update overage item to have new included usage", async () => {
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
	return;

	test("should have correct invoice  next cycle", async () => {
		const invoiceTotal = await getExpectedInvoiceTotal({
			org: ctx.org,
			env: ctx.env,
			customerId,
			productId: pro.id,
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			usage: [
				{
					featureId: TestFeature.Words,
					value: usage,
				},
			],
		});

		let curUnix = Date.now();
		curUnix = await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			advanceTo: addMonths(curUnix, 1).getTime(),
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			advanceTo: addHours(curUnix, hoursToFinalizeInvoice).getTime(),
			waitForSeconds: 10,
		});

		const customer = await autumn.customers.get(customerId);
		const invoice = customer.invoices![0];
		expect(invoice.total).toBe(invoiceTotal);
	});
});
