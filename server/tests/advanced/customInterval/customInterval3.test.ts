import { beforeAll, describe, expect, test } from "bun:test";
import { LegacyVersion } from "@autumn/shared";
import chalk from "chalk";
import { addDays, addMonths } from "date-fns";
import type Stripe from "stripe";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { calculateProrationAmount } from "@/internal/invoices/prorationUtils.js";
import {
	constructFeatureItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";
import {
	constructProduct,
	constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts.js";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "customInterval3";

export const pro = constructProduct({
	type: "pro",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Words,
			intervalCount: 2,
		}),
	],
	intervalCount: 2,
});

const prepaidWordsItem = constructPrepaidItem({
	featureId: TestFeature.Words,
	price: 10,
	billingUnits: 1,
	includedUsage: 0,
	intervalCount: 2,
});

export const addOn = constructRawProduct({
	id: "addOn",
	items: [prepaidWordsItem],
	isAddOn: true,
});

describe(`${chalk.yellowBright(`${testCase}: Testing custom interval on add on merged product`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;
	let stripeCli: Stripe;

	beforeAll(async () => {
		stripeCli = ctx.stripeCli;

		await initProductsV0({
			ctx,
			products: [pro, addOn],
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

	test("should upgrade to attached add on and have correct invoice next cycle", async () => {
		const curUnix = await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addDays(new Date(), 20).getTime(),
			waitForSeconds: 15,
		});

		const wordBillingSets = 2;
		const wordsBillingUnits = prepaidWordsItem.billing_units! * wordBillingSets;
		await autumn.attach({
			customer_id: customerId,
			product_id: addOn.id,
			options: [
				{
					feature_id: TestFeature.Words,
					quantity: wordsBillingUnits,
				},
			],
		});

		const customer = await autumn.customers.get(customerId);
		const proProduct = customer.products.find((p) => p.id === pro.id);
		const invoices = customer.invoices;
		expectProductAttached({
			customer,
			product: pro,
		});

		expectProductAttached({
			customer,
			product: addOn,
		});

		const expectedPrice = wordsBillingUnits * prepaidWordsItem.price!;
		const proratedPrice = calculateProrationAmount({
			amount: expectedPrice,
			periodStart: new Date().getTime(),
			periodEnd: addMonths(new Date(), 2).getTime(),
			now: curUnix!,
		});

		expect(invoices[0].product_ids).toContain(addOn.id);
		expect(invoices[0].total).toBeCloseTo(proratedPrice, 1);

		const expectedAddonEnd = addMonths(new Date(), 2);
		const approximate = 1000 * 60 * 60 * 24; // +- 1 day
		const addOnProduct = customer.products.find((p) => p.id === addOn.id);

		expect(addOnProduct?.current_period_end).toBeCloseTo(
			expectedAddonEnd.getTime(),
			-Math.log10(approximate),
		);
	});
});
