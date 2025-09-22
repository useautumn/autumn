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
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { addPrefixToProducts } from "tests/attach/utils.js";

import { expect } from "chai";
import { resetAndGetCusEnt } from "./rolloverTestUtils.js";

let freeRollover = { max: 1000, length: 1, duration: RolloverDuration.Month };
let proRollover = { max: 600, length: 1, duration: RolloverDuration.Month };

const freeMsges = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 500,
	rolloverConfig: freeRollover,
}) as LimitedItem;

const proMsges = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 500,
	rolloverConfig: proRollover,
}) as LimitedItem;

const free = constructProduct({
	items: [freeMsges],
	type: "free",
	isDefault: false,
});

const pro = constructProduct({
	items: [proMsges],
	type: "pro",
});

const testCase = "rollover5";

describe(`${chalk.yellowBright(`${testCase}: Testing rollovers for upgrade`)}`, () => {
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
			products: [free, pro],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: [free, pro],
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

	it("should create rollovers", async function () {
		await resetAndGetCusEnt({
			customer,
			db,
			productGroup: testCase,
			featureId: TestFeature.Messages,
		});
		await resetAndGetCusEnt({
			customer,
			db,
			productGroup: testCase,
			featureId: TestFeature.Messages,
		});

		// Attach pro
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		let cus = await autumn.customers.get(customerId);
		let msgesFeature = cus.features[TestFeature.Messages];
		let freeRolloverBalance = freeMsges.included_usage * 2;
		let proRolloverBalance = Math.min(proRollover.max, freeRolloverBalance);

		expect(msgesFeature).to.exist;
		expect(msgesFeature?.balance).to.equal(
			proMsges.included_usage + proRolloverBalance,
		);
		// @ts-ignore
		let rollovers = msgesFeature?.rollovers;
		expect(rollovers[0].balance).to.equal(100);
		expect(rollovers[1].balance).to.equal(500);
	});
});
