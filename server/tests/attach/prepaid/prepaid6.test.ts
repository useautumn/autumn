import { type Customer, LegacyVersion, OnDecrease, OnIncrease } from "@autumn/shared";
import { beforeAll, describe, expect, test } from "bun:test";
import chalk from "chalk";
import { addHours, addMonths } from "date-fns";
import type Stripe from "stripe";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils.js";

const userItem = constructPrepaidItem({
	featureId: TestFeature.Users,
	price: 10,
	billingUnits: 1,
	config: {
		on_increase: OnIncrease.ProrateImmediately,
		on_decrease: OnDecrease.None,
	},
});

export const pro = constructProduct({
	items: [userItem],
	excludeBase: true,
	type: "pro",
});

const testCase = "prepaid6";
describe(`${chalk.yellowBright(`attach/${testCase}: update quantity, no proration downgrade, cont use`)}`, () => {
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
			feature_id: TestFeature.Users,
			quantity: 4,
		},
	];

	const originalQuantity = 4;
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

	const usage = 3;
	const newQuantity = 3;
	test("should use 3 users, then downgrade to 3 seats", async () => {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: usage,
		});

		await timeout(3000);

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
					feature_id: TestFeature.Users,
					quantity: newQuantity,
				},
			],
			usage: [
				{
					featureId: TestFeature.Users,
					value: usage,
				},
			],
		});
	});
	test("should have correct balance (0) next cycle", async () => {
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			advanceTo: addHours(
				addMonths(new Date(), 1),
				hoursToFinalizeInvoice,
			).getTime(),
			waitForSeconds: 30,
		});

		const autumnCus = await autumn.customers.get(customerId);

		expect(autumnCus.features[TestFeature.Users].balance).toBe(0);
		const product = autumnCus.products.find((p: any) => p.id == pro.id) as any;
		const userItem = product.items.find(
			(i: any) => i.feature_id == TestFeature.Users,
		);

		expect(userItem?.quantity).toBe(newQuantity);
		expect(userItem?.upcoming_quantity).toBeUndefined();
		expect(autumnCus.invoices[0].total).toBe(newQuantity * userItem.price);
	});
});
