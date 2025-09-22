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

const testCase = "prepaid1";

export let pro = constructProduct({
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

	it("should reduce quantity to 200 and have correct sub item quantity + cus product quantity", async function () {
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
					quantity: 200,
				},
			],
		});
	});

	it("should increase quantity to 400 and have correct sub item quantity + invoice..", async function () {
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
			waitForInvoice: 5000,
		});
	});

	const newQuantity = 200;
	it("should decrease quantity to 200, advance clock to next cycle and have correct balance", async function () {
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
					quantity: newQuantity,
				},
			],
		});

		await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addHours(
				addMonths(new Date(), 1),
				hoursToFinalizeInvoice,
			).getTime(),
			waitForSeconds: 40,
		});

		const autumnCus = await autumn.customers.get(customerId);
		expect(autumnCus.features[TestFeature.Messages].balance).to.equal(
			newQuantity,
		);

		expect(autumnCus.invoices.length).to.equal(3);
		expect(autumnCus.invoices[0].total).to.equal((newQuantity / 100) * 12.5);

		const cusProduct = await getMainCusProduct({
			db,
			internalCustomerId: customer.internal_id,
			productGroup: testCase,
		});

		expect(cusProduct?.options[0].quantity).to.equal(newQuantity / 100);
		expect(cusProduct?.options[0].upcoming_quantity).to.not.exist;
	});
});
