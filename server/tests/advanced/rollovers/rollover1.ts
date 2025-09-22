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
	ProductItemInterval,
	RolloverDuration,
} from "@autumn/shared";

import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { addPrefixToProducts } from "tests/attach/utils.js";

import { expect } from "chai";
import { timeout } from "@/utils/genUtils.js";
import { resetAndGetCusEnt } from "./rolloverTestUtils.js";

let rolloverConfig = { max: 500, length: 1, duration: RolloverDuration.Month };
const messagesItem = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 400,
	interval: ProductItemInterval.Month,
	rolloverConfig,
}) as LimitedItem;

export let free = constructProduct({
	items: [messagesItem],
	type: "free",
	isDefault: false,
});

const testCase = "rollover1";
// , per entity and regular

describe(`${chalk.yellowBright(`${testCase}: Testing rollovers for feature item`)}`, () => {
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
			products: [free],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: [free],
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

	it("should attach free product", async function () {
		await autumn.attach({
			customer_id: customerId,
			product_id: free.id,
		});
	});

	let messageUsage = 250;
	let curBalance = messagesItem.included_usage;

	it("should create track messages, reset, and have correct rollover", async function () {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messageUsage,
		});

		await timeout(3000);

		await resetAndGetCusEnt({
			db,
			customer,
			productGroup: free.group,
			featureId: TestFeature.Messages,
		});

		let cus = await autumn.customers.get(customerId);
		let msgesFeature = cus.features[TestFeature.Messages];

		let expectedRollover = Math.min(
			messagesItem.included_usage - messageUsage,
			rolloverConfig.max,
		);

		let expectedBalance = messagesItem.included_usage + expectedRollover;

		expect(msgesFeature).to.exist;
		expect(msgesFeature?.balance).to.equal(expectedBalance);
		// @ts-ignore
		expect(msgesFeature?.rollovers[0].balance).to.equal(expectedRollover);
		curBalance = expectedBalance;
	});

	// let usage2 = 50;
	it("should reset again and have correct rollover", async function () {
		await resetAndGetCusEnt({
			db,
			customer,
			productGroup: free.group,
			featureId: TestFeature.Messages,
		});

		let expectedRollover = Math.min(curBalance, rolloverConfig.max);
		let expectedBalance = messagesItem.included_usage + expectedRollover;

		let cus = await autumn.customers.get(customerId);
		let msgesFeature = cus.features[TestFeature.Messages];

		expect(msgesFeature).to.exist;
		expect(msgesFeature?.balance).to.equal(expectedBalance);

		// @ts-ignore (oldest rollover should be 100 (150 - 50))
		expect(msgesFeature?.rollovers[0].balance).to.equal(100);
		// @ts-ignore (newest rollover should be 400 (msges.included_usage))
		expect(msgesFeature?.rollovers[1].balance).to.equal(400);
	});

	it("should track messages and deduct from rollovers first", async function () {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 150,
		});

		await timeout(3000);

		let cus = await autumn.customers.get(customerId);
		let msgesFeature = cus.features[TestFeature.Messages];

		// @ts-ignore
		let rollover1 = msgesFeature?.rollovers[0];
		// @ts-ignore
		let rollover2 = msgesFeature?.rollovers[1];

		expect(rollover1.balance).to.equal(0);
		expect(rollover2.balance).to.equal(350);
	});

	it("should track and deduct from rollover + original balance", async function () {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 400,
		});

		await timeout(3000);

		let cus = await autumn.customers.get(customerId);
		let msgesFeature = cus.features[TestFeature.Messages];

		// @ts-ignore
		let rollovers = msgesFeature.rollovers;
		expect(rollovers![0].balance).to.equal(0);
		expect(rollovers![1].balance).to.equal(0);
		expect(msgesFeature.balance).to.equal(messagesItem.included_usage - 50);
	});
});
