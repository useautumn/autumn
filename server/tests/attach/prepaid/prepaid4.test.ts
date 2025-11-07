import { LegacyVersion, OnDecrease, OnIncrease } from "@autumn/shared";
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

const testCase = "prepaid4";

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

describe(`${chalk.yellowBright(`attach/${testCase}: Testing prepaid reset`)}`, () => {
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

		const res = await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

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
	// return;

	const usage = 100;
	test("should track usage for prepaid and have correct balance", async () => {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: usage,
		});

		await timeout(3000);

		const customer = await autumn.customers.get(customerId);
		const newBalance = options[0].quantity - usage;
		expect(customer.features[TestFeature.Messages].balance).toBe(
			newBalance,
		);
	});

	test("should advance clock to next cycle and have correct balance", async () => {
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			advanceTo: addHours(
				addMonths(new Date(), 1),
				hoursToFinalizeInvoice,
			).getTime(),
			waitForSeconds: 30,
		});

		const customer = await autumn.customers.get(customerId);
		expect(customer.features[TestFeature.Messages].balance).toBe(
			options[0].quantity,
		);
	});
});
