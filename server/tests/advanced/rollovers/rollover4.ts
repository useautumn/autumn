import {
	APIVersion,
	type AppEnv,
	type Customer,
	type LimitedItem,
	type Organization,
	RolloverDuration,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import { addMonths } from "date-fns";
import type Stripe from "stripe";
import { addPrefixToProducts } from "tests/attach/utils.js";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { createProducts } from "tests/utils/productUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils.js";

const rolloverConfig = {
	max: 400,
	length: 1,
	duration: RolloverDuration.Month,
};
const messagesItem = constructPrepaidItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
	billingUnits: 300,
	price: 10,
	rolloverConfig,
}) as LimitedItem;

export const pro = constructProduct({
	items: [messagesItem],
	type: "pro",
	isDefault: false,
});

const testCase = "rollover4";

describe(`${chalk.yellowBright(`${testCase}: Testing rollovers for usage price feature`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let _customer: Customer;
	let stripeCli: Stripe;

	let curUnix = Date.now();

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
		_customer = res.customer;
	});

	const paidQuantity = 300;
	const balance = paidQuantity + messagesItem.included_usage;
	const options = [
		{
			feature_id: TestFeature.Messages,
			quantity: paidQuantity,
		},
	];

	it("should attach pro product", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
			options,
		});
	});

	const rollover = 50;
	it("should create track messages, reset, and have correct rollover", async () => {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: balance - rollover,
		});

		await timeout(3000);

		curUnix = await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addMonths(new Date(), 1).getTime(),
			waitForSeconds: 20,
		});

		const cus = await autumn.customers.get(customerId);
		const msgesFeature = cus.features[TestFeature.Messages];

		// @ts-expect-error
		const rollovers = msgesFeature?.rollovers;

		expect(msgesFeature).to.exist;
		expect(msgesFeature?.balance).to.equal(balance + rollover);
		expect(rollovers[0].balance).to.equal(rollover);
	});

	// let usage2 = 50;
	it("should  reset again and have correct rollover", async () => {
		await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addMonths(curUnix, 1).getTime(),
			waitForSeconds: 20,
		});

		const newRollover = Math.min(balance + rollover, rolloverConfig.max);
		const cus = await autumn.customers.get(customerId);
		const msgesFeature = cus.features[TestFeature.Messages];
		// @ts-expect-error
		const rollovers = msgesFeature?.rollovers;

		expect(msgesFeature).to.exist;
		expect(msgesFeature?.balance).to.equal(balance + newRollover);
		expect(rollovers[0].balance).to.equal(0);
		expect(rollovers[1].balance).to.equal(400);
	});
});
