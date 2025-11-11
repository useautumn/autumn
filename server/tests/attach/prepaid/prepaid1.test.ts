import { type Customer, LegacyVersion, OnDecrease, OnIncrease } from "@autumn/shared";
import { beforeAll, describe, expect, test } from "bun:test";
import chalk from "chalk";
import { addHours, addMonths } from "date-fns";
import type Stripe from "stripe";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { hoursToFinalizeInvoice } from "@tests/utils/constants.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { getMainCusProduct } from "@/internal/customers/cusProducts/cusProductUtils.js";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils.js";

const testCase = "prepaid1";

export const pro = constructProduct({
	items: [
		constructPrepaidItem({
			featureId: TestFeature.Messages,
			billingUnits: 100,
			price: 12.5,
			config: {
				on_increase: OnIncrease.ProrateImmediately,
				on_decrease: OnDecrease.None,
			},
		}),
	],
	excludeBase: true,
	type: "pro",
});

describe(`${chalk.yellowBright(`attach/${testCase}: update quantity, no proration downgrade, single use`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;

	const curUnix = new Date().getTime();
	let customer: Customer;

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [pro],
			prefix: testCase,
			customerId,
		});

		const res = await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		customer = res.customer;
		testClockId = res.testClockId!;
	});

	const options = [
		{
			feature_id: TestFeature.Messages,
			quantity: 300,
		},
	];

	test("should attach pro product to customer", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			options,
		});

		const customer = await autumn.customers.get(customerId);
		expectProductAttached({
			customer,
			product: pro,
		});
	});

	test("should reduce quantity to 200 and have correct sub item quantity + cus product quantity", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 200,
				},
			],
		});
	});

	test("should increase quantity to 400 and have correct sub item quantity + invoice..", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 400,
				},
			],
			waitForInvoice: 5000,
		});
	});

	const newQuantity = 200;
	test("should decrease quantity to 200, advance clock to next cycle and have correct balance", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: newQuantity,
				},
			],
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			advanceTo: addHours(
				addMonths(new Date(), 1),
				hoursToFinalizeInvoice,
			).getTime(),
			waitForSeconds: 40,
		});

		const autumnCus = await autumn.customers.get(customerId);
		expect(autumnCus.features[TestFeature.Messages].balance).toBe(
			newQuantity,
		);

		expect(autumnCus.invoices.length).toBe(3);
		expect(autumnCus.invoices[0].total).toBe((newQuantity / 100) * 12.5);

		const cusProduct = await getMainCusProduct({
			db: ctx.db,
			internalCustomerId: customer.internal_id,
			productGroup: testCase,
		});

		expect(cusProduct?.options[0].quantity).toBe(newQuantity / 100);
		expect(cusProduct?.options[0].upcoming_quantity).toBeUndefined();
	});
});
