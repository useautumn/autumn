import {
	type AppEnv,
	type Customer,
	LegacyVersion,
	type LimitedItem,
	type Organization,
	ProductItemInterval,
	RolloverDuration,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import type Stripe from "stripe";
import { addPrefixToProducts } from "tests/attach/utils.js";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { createProducts } from "tests/utils/productUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { resetAndGetCusEnt } from "./rolloverTestUtils.js";

const rolloverConfig = {
	max: 500,
	length: 1,
	duration: RolloverDuration.Month,
};
const messagesItem = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 400,
	interval: ProductItemInterval.Month,
	rolloverConfig,
}) as LimitedItem;

export const free = constructProduct({
	items: [messagesItem],
	type: "free",
	isDefault: false,
});

const testCase = "rollover1";
// , per entity and regular

describe(`${chalk.yellowBright(`${testCase}: Testing rollovers for feature item`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let customer: Customer;
	let stripeCli: Stripe;

	const curUnix = new Date().getTime();

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

	it("should attach free product", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: free.id,
		});
	});

	const messageUsage = 250;
	let curBalance = messagesItem.included_usage;

	it("should create track messages, reset, and have correct rollover", async () => {
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

		const cus = await autumn.customers.get(customerId);
		const msgesFeature = cus.features[TestFeature.Messages];

		const expectedRollover = Math.min(
			messagesItem.included_usage - messageUsage,
			rolloverConfig.max,
		);

		const expectedBalance = messagesItem.included_usage + expectedRollover;

		expect(msgesFeature).to.exist;
		expect(msgesFeature?.balance).to.equal(expectedBalance);
		// @ts-expect-error
		expect(msgesFeature?.rollovers[0].balance).to.equal(expectedRollover);
		curBalance = expectedBalance;
	});

	// let usage2 = 50;
	it("should reset again and have correct rollover", async () => {
		await resetAndGetCusEnt({
			db,
			customer,
			productGroup: free.group,
			featureId: TestFeature.Messages,
		});

		const expectedRollover = Math.min(curBalance, rolloverConfig.max);
		const expectedBalance = messagesItem.included_usage + expectedRollover;

		const cus = await autumn.customers.get(customerId);
		const msgesFeature = cus.features[TestFeature.Messages];

		expect(msgesFeature).to.exist;
		expect(msgesFeature?.balance).to.equal(expectedBalance);

		// @ts-expect-error (oldest rollover should be 100 (150 - 50))
		expect(msgesFeature?.rollovers[0].balance).to.equal(100);
		// @ts-expect-error (newest rollover should be 400 (msges.included_usage))
		expect(msgesFeature?.rollovers[1].balance).to.equal(400);
	});

	it("should track messages and deduct from rollovers first", async () => {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 150,
		});

		await timeout(3000);

		const cus = await autumn.customers.get(customerId);
		const msgesFeature = cus.features[TestFeature.Messages];

		// @ts-expect-error
		const rollover1 = msgesFeature?.rollovers[0];
		// @ts-expect-error
		const rollover2 = msgesFeature?.rollovers[1];

		expect(rollover1.balance).to.equal(0);
		expect(rollover2.balance).to.equal(350);
	});
	return;

	it("should track and deduct from rollover + original balance", async () => {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 400,
		});

		await timeout(3000);

		const cus = await autumn.customers.get(customerId);
		const msgesFeature = cus.features[TestFeature.Messages];

		// @ts-expect-error
		const rollovers = msgesFeature.rollovers;
		expect(rollovers![0].balance).to.equal(0);
		expect(rollovers![1].balance).to.equal(0);
		expect(msgesFeature.balance).to.equal(messagesItem.included_usage - 50);
	});
});
