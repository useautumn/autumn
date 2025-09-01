import {
	APIVersion,
	type AppEnv,
	OnDecrease,
	OnIncrease,
	type Organization,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import { addHours, addMonths } from "date-fns";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { createProducts } from "tests/utils/productUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils.js";
import { addPrefixToProducts } from "../utils.js";

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
	const autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;

	const _curUnix = Date.now();

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		const res = await initCustomer({
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

		testClockId = res.testClockId!;
	});

	const options = [
		{
			feature_id: TestFeature.Messages,
			quantity: 300,
		},
	];

	it("should attach pro product to customer", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli,
			db,
			org,
			env,
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
	it("should track usage for prepaid and have correct balance", async () => {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: usage,
		});

		await timeout(3000);

		const customer = await autumn.customers.get(customerId);
		const newBalance = options[0].quantity - usage;
		expect(customer.features[TestFeature.Messages].balance).to.equal(
			newBalance,
		);
	});

	it("should advance clock to next cycle and have correct balance", async () => {
		await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addHours(
				addMonths(new Date(), 1),
				hoursToFinalizeInvoice,
			).getTime(),
			waitForSeconds: 30,
		});

		const customer = await autumn.customers.get(customerId);
		expect(customer.features[TestFeature.Messages].balance).to.equal(
			options[0].quantity,
		);
	});
});
