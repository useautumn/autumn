import { beforeAll, describe, expect, test } from "bun:test";
import { BillingInterval, LegacyVersion, type ProductV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { hoursToFinalizeInvoice } from "@tests/utils/constants.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import { getExpectedInvoiceTotal } from "@tests/utils/expectUtils/expectInvoiceUtils.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { addHours, addMonths, addWeeks } from "date-fns";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils.js";
import { timeout } from "@/utils/genUtils.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import runUpdateEntsTest from "../updateEnts/expectUpdateEnts.js";
import { replaceItems } from "../utils.js";

export const pro = constructProduct({
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "pro",
});

const testCase = "newVersion1";

describe(`${chalk.yellowBright(`${testCase}: Testing attach with new version`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;

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

	const usage = 50000;
	let newPro: ProductV2;
	test("should update product to new version", async () => {
		newPro = structuredClone(pro);
		let newItems = replaceItems({
			items: pro.items,
			interval: BillingInterval.Month,
			newItem: constructPriceItem({
				price: 100,
				interval: BillingInterval.Month,
			}),
		});

		newItems = replaceItems({
			items: newItems,
			featureId: TestFeature.Words,
			newItem: constructArrearItem({
				featureId: TestFeature.Words,
				price: 0.5,
			}),
		});

		newPro.version = 2;
		newPro.items = newItems;

		await autumn.products.update(pro.id, {
			items: newItems,
		});
	});

	test("should attach pro v2", async () => {
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			advanceTo: addWeeks(Date.now(), 1).getTime(),
		});

		await autumn.track({
			customer_id: customerId,
			value: usage,
			feature_id: TestFeature.Words,
		});

		await timeout(2000);

		await runUpdateEntsTest({
			autumn,
			stripeCli: ctx.stripeCli,
			customerId,
			customProduct: newPro,
			newVersion: 2,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			usage: [
				{
					featureId: TestFeature.Words,
					value: usage,
				},
			],
		});
	});

	test("should have correct invoice total on next cycle", async () => {
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
			onlyIncludeMonthly: true,
		});

		let curUnix = Date.now();
		curUnix = await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			advanceTo: addMonths(curUnix, 1).getTime(),
			waitForSeconds: 30,
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			advanceTo: addHours(curUnix, hoursToFinalizeInvoice).getTime(),
			waitForSeconds: 30,
		});

		const customer = await autumn.customers.get(customerId);
		const invoice = customer.invoices[0];
		expect(invoice.total).toBe(invoiceTotal);
	});
});
