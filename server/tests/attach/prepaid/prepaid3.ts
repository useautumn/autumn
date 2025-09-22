import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import {
	APIVersion,
	AppEnv,
	OnDecrease,
	OnIncrease,
	Organization,
} from "@autumn/shared";
import chalk from "chalk";
import Stripe from "stripe";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { addPrefixToProducts } from "../utils.js";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils.js";
import { addHours, addMonths, addWeeks } from "date-fns";
import { expect } from "chai";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";

const testCase = "prepaid3";

export let pro = constructProduct({
	items: [
		constructPrepaidItem({
			featureId: TestFeature.Messages,
			billingUnits: 100,
			price: 12.5,
			config: {
				on_increase: OnIncrease.ProrateNextCycle,
				on_decrease: OnDecrease.None,
			},
		}),
	],
	excludeBase: true,
	type: "pro",
});

describe(`${chalk.yellowBright(`attach/${testCase}: upgrade quantity, prorate next cycle, single use`)}`, () => {
	let customerId = testCase;
	let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;

	let curUnix = new Date().getTime();

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

	it("should attach pro product to customer", async function () {
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

		let customer = await autumn.customers.get(customerId);
		expectProductAttached({
			customer,
			product: pro,
		});
	});

	it("should increase advance test clock, increase quantity to 400", async function () {
		const usage = Math.floor(Math.random() * 220);
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: usage,
		});

		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli,
			db,
			org,
			env,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 400,
				},
			],
			usage: [
				{
					featureId: TestFeature.Messages,
					value: usage,
				},
			],
		});

		const customer = await autumn.customers.get(customerId);
		expect(customer.invoices.length).to.equal(1);
	});

	it("should advance test clock to end of cycle and have correct invoice", async function () {
		await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addHours(
				addMonths(new Date(), 1),
				hoursToFinalizeInvoice,
			).getTime(),
			waitForSeconds: 10,
		});
	});
});
