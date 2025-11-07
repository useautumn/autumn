import {
	type AppEnv,
	LegacyVersion,
	type LimitedItem,
	type Organization,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import type Stripe from "stripe";
import { addPrefixToProducts } from "tests/attach/utils.js";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { createProducts } from "tests/utils/productUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import {
	constructArrearItem,
	constructFeatureItem,
} from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

const messageItem = constructArrearItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
	billingUnits: 1,
	price: 0.5,
	usageLimit: 500,
}) as LimitedItem;

export const pro = constructProduct({
	items: [messageItem],
	type: "pro",
});

const addOnMessages = constructFeatureItem({
	featureId: TestFeature.Messages,
	interval: null,
	includedUsage: 250,
}) as LimitedItem;

const messageAddOn = constructProduct({
	type: "one_off",
	items: [addOnMessages],
});

const testCase = "usageLimit2";

describe(`${chalk.yellowBright(`${testCase}: Testing usage limits, usage prices`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
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
			products: [pro, messageAddOn],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: [pro, messageAddOn],
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

	it("should attach pro product", async () => {
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

	const initialUsage =
		messageItem.included_usage + messageItem.usage_limit! + 1000;

	it("should track more messages than limit and not surpass", async () => {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: initialUsage,
		});

		await timeout(2000);

		const check = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		const customer = await autumn.customers.get(customerId);

		const expectedBalance =
			messageItem.included_usage - messageItem.usage_limit!;

		expect(check.balance).to.equal(expectedBalance);
		expect(check.allowed).to.equal(false);
		// @ts-expect-error
		expect(check.usage_limit!).to.equal(messageItem.usage_limit!);
		// @ts-expect-error
		expect(customer.features[TestFeature.Messages].usage_limit).to.equal(
			messageItem.usage_limit!,
		);
	});

	it("should purchase add ons and have correct check results", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: messageAddOn.id,
		});

		const check = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		const customer = await autumn.customers.get(customerId);
		const expectedBalance =
			messageItem.included_usage -
			messageItem.usage_limit! +
			addOnMessages.included_usage;

		expect(check.balance).to.equal(expectedBalance);
		expect(check.allowed).to.equal(true);

		// @ts-expect-error
		expect(check.usage_limit!).to.equal(
			messageItem.usage_limit! + addOnMessages.included_usage,
		);
		// @ts-expect-error
		expect(customer.features[TestFeature.Messages].usage_limit).to.equal(
			messageItem.usage_limit! + addOnMessages.included_usage,
		);
	});

	it("should use up all add ons and have correct check results", async () => {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: addOnMessages.included_usage + 500,
		});

		await timeout(2000);

		const check = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		const customer = await autumn.customers.get(customerId);

		const expectedBalance =
			messageItem.included_usage - messageItem.usage_limit!;
		expect(check.balance).to.equal(expectedBalance);
		expect(check.allowed).to.equal(false);
		// @ts-expect-error
		expect(check.usage_limit!).to.equal(
			messageItem.usage_limit! + addOnMessages.included_usage,
		);
		// @ts-expect-error
		expect(customer.features[TestFeature.Messages].usage_limit).to.equal(
			messageItem.usage_limit! + addOnMessages.included_usage,
		);
	});
});
