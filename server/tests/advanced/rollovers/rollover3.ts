import chalk from "chalk";
import Stripe from "stripe";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

import {
	APIVersion,
	AppEnv,
	Customer,
	LimitedItem,
	Organization,
	RolloverDuration,
} from "@autumn/shared";

import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { addPrefixToProducts } from "tests/attach/utils.js";

import { expect } from "chai";
import { timeout } from "@/utils/genUtils.js";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils.js";
import { addMonths } from "date-fns";

let rolloverConfig = { max: 500, length: 1, duration: RolloverDuration.Month };
const messagesItem = constructArrearProratedItem({
	featureId: TestFeature.Messages,
	includedUsage: 400,
	rolloverConfig,
}) as LimitedItem;

export let pro = constructProduct({
	items: [messagesItem],
	type: "pro",
	isDefault: false,
});

const testCase = "rollover3";

describe(`${chalk.yellowBright(`${testCase}: Testing rollovers for usage price feature`)}`, () => {
	let customerId = testCase;
	let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let customer: Customer;
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

		const res = await initCustomer({
			autumn: autumnJs,
			customerId,
			db,
			org,
			env,
			attachPm: "success",
		});

		testClockId = res.testClockId!;
		customer = res.customer;
	});

	it("should attach pro product", async function () {
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});
	});

	let rollover = 250;
	let curBalance = messagesItem.included_usage;

	it("should create track messages, reset, and have correct rollover", async function () {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesItem.included_usage - rollover,
		});

		await timeout(3000);

		await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addMonths(new Date(), 1).getTime(),
			waitForSeconds: 20,
		});

		let cus = await autumn.customers.get(customerId);
		let msgesFeature = cus.features[TestFeature.Messages];

		let expectedBalance = messagesItem.included_usage + rollover;

		expect(msgesFeature).to.exist;
		expect(msgesFeature?.balance).to.equal(expectedBalance);
		// @ts-ignore
		expect(msgesFeature?.rollovers[0].balance).to.equal(rollover);
		curBalance = expectedBalance;
	});
});
