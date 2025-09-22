import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import {
	APIVersion,
	AppEnv,
	entities,
	OnDecrease,
	OnIncrease,
	Organization,
} from "@autumn/shared";
import chalk from "chalk";
import Stripe from "stripe";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { expect } from "chai";
import { addWeeks } from "date-fns";
import { timeout } from "@/utils/genUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { addPrefixToProducts } from "tests/attach/utils.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectSubQuantityCorrect } from "tests/utils/expectUtils/expectContUseUtils.js";

let userItem = constructArrearProratedItem({
	featureId: TestFeature.Users,
	pricePerUnit: 50,
	includedUsage: 1,
	config: {
		on_increase: OnIncrease.BillImmediately,
		on_decrease: OnDecrease.None,
	},
});

export let pro = constructProduct({
	items: [userItem],
	type: "pro",
});

const testCase = "track1";

describe(`${chalk.yellowBright(`contUse/${testCase}: Testing track usage for cont use`)}`, () => {
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

		addPrefixToProducts({
			products: [pro],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: [pro],
			customerId,
			db,
			orgId: org.id,
			env,
		});

		const { testClockId: testClockId1 } = await initCustomer({
			autumn: autumnJs,
			customerId,
			db,
			org,
			env,
			attachPm: "success",
		});

		testClockId = testClockId1!;
	});

	let usage = 0;
	it("should attach pro", async function () {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli,
			db,
			org,
			env,
		});
	});

	it("should create track +3 usage and have correct invoice", async function () {
		curUnix = await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addWeeks(new Date(), 2).getTime(),
			waitForSeconds: 5,
		});

		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 3,
		});

		await timeout(15000);

		usage += 3;

		await expectSubQuantityCorrect({
			stripeCli,
			productId: pro.id,
			db,
			org,
			env,
			customerId,
			usage,
		});

		let customer = await autumn.customers.get(customerId);
		let invoices = customer.invoices;
		expect(invoices.length).to.equal(2);
		expect(invoices[0].total).to.equal(userItem.price! * 2);
	});

	it("should track -3 and have no new invoice", async function () {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: -3,
		});

		await timeout(5000);

		let customer = await autumn.customers.get(customerId);
		let invoices = customer.invoices;
		expect(invoices.length).to.equal(2);

		await expectSubQuantityCorrect({
			stripeCli,
			productId: pro.id,
			db,
			org,
			env,
			customerId,
			usage,
			numReplaceables: 3,
			itemQuantity: usage - 3,
		});
	});

	it("should track +3 and have no new invoice", async function () {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 3,
		});

		await timeout(5000);

		let customer = await autumn.customers.get(customerId);
		let invoices = customer.invoices;
		expect(invoices.length).to.equal(2);

		await expectSubQuantityCorrect({
			stripeCli,
			productId: pro.id,
			db,
			org,
			env,
			customerId,
			usage,
		});
	});
});
