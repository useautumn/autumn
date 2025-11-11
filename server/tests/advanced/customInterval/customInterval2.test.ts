import { beforeAll, describe, expect, test } from "bun:test";
import { LegacyVersion } from "@autumn/shared";
import chalk from "chalk";
import { addHours, addMonths } from "date-fns";
import type Stripe from "stripe";
import { TestFeature } from "@tests/setup/v2Features.js";
import { hoursToFinalizeInvoice } from "@tests/utils/constants.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import { getExpectedInvoiceTotal } from "@tests/utils/expectUtils/expectInvoiceUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructRawProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "customInterval2";

export const pro = constructRawProduct({
	id: "pro",
	items: [
		constructArrearItem({
			includedUsage: 0,
			featureId: TestFeature.Words,
			intervalCount: 2,
		}),
	],
});

describe(`${chalk.yellowBright(`${testCase}: Testing custom interval on arrear prorated price`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;
	let stripeCli: Stripe;

	beforeAll(async () => {
		stripeCli = ctx.stripeCli;

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

	const usage = 100012;
	test("should upgrade to premium product and have correct invoice next cycle", async () => {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Words,
			value: usage,
		});

		const curUnix = await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addHours(
				addMonths(new Date(), 2),
				hoursToFinalizeInvoice,
			).getTime(),
			waitForSeconds: 30,
		});

		const invoiceAmount = await getExpectedInvoiceTotal({
			customerId,
			productId: pro.id,
			usage: [{ featureId: TestFeature.Words, value: usage }],
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
		});

		const customer = await autumn.customers.get(customerId);
		expect(customer.invoices.length).toBe(2);
		expect(invoiceAmount).toBe(customer.invoices[0].total);
	});
});
