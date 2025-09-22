import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import {
	APIVersion,
	AppEnv,
	Customer,
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
import { addHours, addMonths } from "date-fns";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";
import { expect } from "chai";
import { getMainCusProduct } from "@/internal/customers/cusProducts/cusProductUtils.js";
import { timeout } from "@/utils/genUtils.js";

const userItem = constructPrepaidItem({
	featureId: TestFeature.Users,
	price: 10,
	billingUnits: 1,
	config: {
		on_increase: OnIncrease.ProrateImmediately,
		on_decrease: OnDecrease.None,
	},
});

export let pro = constructProduct({
	items: [userItem],
	excludeBase: true,
	type: "pro",
});

const testCase = "prepaid6";
describe(`${chalk.yellowBright(`attach/${testCase}: update quantity, no proration downgrade, cont use`)}`, () => {
	let customerId = testCase;
	let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;

	let curUnix = new Date().getTime();
	let customer: Customer;

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

	const usage = 3;
	const newQuantity = 3;
	it("should use 3 users, then downgrade to 3 seats", async function () {
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
			stripeCli,
			db,
			org,
			env,
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
	it("should have correct balance (0) next cycle", async function () {
		await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addHours(
				addMonths(new Date(), 1),
				hoursToFinalizeInvoice,
			).getTime(),
			waitForSeconds: 30,
		});

		const autumnCus = await autumn.customers.get(customerId);

		expect(autumnCus.features[TestFeature.Users].balance).to.equal(0);
		let product = autumnCus.products.find((p: any) => p.id == pro.id) as any;
		let userItem = product.items.find(
			(i: any) => i.feature_id == TestFeature.Users,
		);

		expect(userItem?.quantity).to.equal(newQuantity);
		expect(userItem?.upcoming_quantity).to.not.exist;
		expect(autumnCus.invoices[0].total).to.equal(newQuantity * userItem.price);
	});
});
