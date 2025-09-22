import chalk from "chalk";
import Stripe from "stripe";

import {
	APIVersion,
	AppEnv,
	CreateEntity,
	LimitedItem,
	Organization,
} from "@autumn/shared";

import { TestFeature } from "tests/setup/v2Features.js";
import { expect } from "chai";
import { timeout } from "@/utils/genUtils.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { addPrefixToProducts } from "../../attach/utils.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils.js";
import { addHours, addMonths } from "date-fns";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";
import { getExpectedInvoiceTotal } from "tests/utils/expectUtils/expectInvoiceUtils.js";

let user = TestFeature.Users;
let admin = TestFeature.Admin;

let userMessages = constructArrearItem({
	featureId: TestFeature.Messages,
	price: 0.5,
	entityFeatureId: user,
}) as LimitedItem;

let adminMessages = constructArrearItem({
	featureId: TestFeature.Messages,
	includedUsage: 0,
	price: 0.1,
	entityFeatureId: admin,
}) as LimitedItem;

export let pro = constructProduct({
	items: [userMessages, adminMessages],
	type: "pro",
});

const testCase = "role3";

describe(`${chalk.yellowBright(`contUse/${testCase}: Testing overages for per entity, diff roles`)}`, () => {
	let customerId = testCase;
	let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_2 });
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;
	let testClockId: string;

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
	});

	let user1 = "user1";
	let user2 = "user2";
	let admin1 = "admin1";
	let admin2 = "admin2";
	let firstEntities: CreateEntity[] = [
		{
			id: user1,
			name: "test",
			feature_id: user,
		},
		{
			id: user2,
			name: "test",
			feature_id: user,
		},
		{
			id: admin1,
			name: "test",
			feature_id: admin,
		},
		{
			id: admin2,
			name: "test",
			feature_id: admin,
		},
	];

	it("should create initial entities, then attach pro", async function () {
		await autumn.entities.create(customerId, firstEntities);

		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli,
			db,
			org,
			env,
			entities: firstEntities,
		});
	});

	let user1Usage = 125000;
	let user2Usage = 150000;

	// total: 275000, included: 10000, overage: 255000
	it("should track correct usage for seat messages", async function () {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: user1Usage,
			entity_id: user1,
		});

		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: user2Usage,
			entity_id: user2,
		});

		await timeout(4000);

		let includedUsage = userMessages.included_usage;

		let { balance: userBalance } = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: user1,
		});

		expect(userBalance).to.equal(includedUsage - user1Usage);

		let { balance: user2Balance } = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: user2,
		});

		expect(user2Balance).to.equal(includedUsage - user2Usage);

		const { balance: admin1Balance } = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: admin1,
		});

		expect(admin1Balance).to.equal(adminMessages.included_usage);

		const { balance: admin2Balance } = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: admin2,
		});

		expect(admin2Balance).to.equal(adminMessages.included_usage);
	});

	let admin1Usage = 130000;
	let admin2Usage = 140000;
	// total: 270000, included: 0, overage: 270000
	it("should track correct usage for admin messages", async function () {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: admin1Usage,
			entity_id: admin1,
		});

		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: admin2Usage,
			entity_id: admin2,
		});

		await timeout(4000);
	});

	it("should have correct invoice next cycle", async function () {
		await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addMonths(new Date(), 1).getTime(),
			// addHours(
			//   addMonths(new Date(), 1),
			//   hoursToFinalizeInvoice
			// ).getTime(),
			waitForSeconds: 30,
		});

		return;

		let includedUsage = userMessages.included_usage;
		let user1Overage = user1Usage - includedUsage;
		let user2Overage = user2Usage - includedUsage;
		let totalUserUsage = user1Overage + user2Overage + includedUsage;

		let admin1Overage = admin1Usage - adminMessages.included_usage;
		let admin2Overage = admin2Usage - adminMessages.included_usage;
		let totalAdminUsage =
			admin1Overage + admin2Overage + adminMessages.included_usage;

		let expectedInvoiceTotal = await getExpectedInvoiceTotal({
			customerId,
			productId: pro.id,
			usage: [
				{
					featureId: TestFeature.Messages,
					entityFeatureId: user,
					value: totalUserUsage,
				},
				{
					featureId: TestFeature.Messages,
					entityFeatureId: admin,
					value: totalAdminUsage,
				},
			],
			stripeCli,
			db,
			org,
			env,
			expectExpired: true,
		});

		let customer = await autumn.customers.get(customerId);
		expect(customer.invoices[0].total).to.equal(expectedInvoiceTotal);
	});
});
