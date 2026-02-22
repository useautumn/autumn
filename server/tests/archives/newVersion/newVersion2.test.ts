import { beforeAll, describe, test } from "bun:test";
import { BillingInterval, LegacyVersion, type ProductV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import runUpdateEntsTest from "../updateEnts/expectUpdateEnts.js";
import { replaceItems } from "../utils.js";

export const pro = constructProduct({
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "pro",
	trial: true,
});

const testCase = "newVersion2";

describe(`${chalk.yellowBright(`${testCase}: Testing attach new version for trial product`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;

	const curUnix = new Date().getTime();

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
		const newItems = replaceItems({
			items: pro.items,
			interval: BillingInterval.Month,
			newItem: constructPriceItem({
				price: 100,
				interval: BillingInterval.Month,
			}),
		});

		newPro.version = 2;
		newPro.items = newItems;

		await autumn.products.update(pro.id, {
			items: newItems,
		});
	});

	return;

	test("should attach pro v2", async () => {
		await runUpdateEntsTest({
			autumn,
			stripeCli: ctx.stripeCli,
			customerId,
			customProduct: newPro,
			newVersion: 2,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
		});
	});

	// it("should have correct invoice total on next cycle", async function () {
	//   const invoiceTotal = await getExpectedInvoiceTotal({
	//     org,
	//     env,
	//     customerId,
	//     productId: pro.id,
	//     stripeCli,
	//     db,
	//     usage: [
	//       {
	//         featureId: TestFeature.Words,
	//         value: usage,
	//       },
	//     ],
	//     onlyIncludeMonthly: true,
	//   });

	//   let curUnix = Date.now();
	//   curUnix = await advanceTestClock({
	//     stripeCli,
	//     testClockId,
	//     advanceTo: addMonths(curUnix, 1).getTime(),
	//     waitForSeconds: 30,
	//   });

	//   await advanceTestClock({
	//     stripeCli,
	//     testClockId,
	//     advanceTo: addHours(curUnix, hoursToFinalizeInvoice).getTime(),
	//     waitForSeconds: 10,
	//   });

	//   const customer = await autumn.customers.get(customerId);
	//   const invoice = customer.invoices[0];
	//   expect(invoice.total).to.equal(
	//     invoiceTotal,
	//     "invoice total after 1 cycle should be correct"
	//   );
	// });
});
