import { beforeAll, describe, expect, test } from "bun:test";
import { LegacyVersion, type LimitedItem } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import type Stripe from "stripe";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import {
	constructArrearItem,
	constructFeatureItem,
} from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

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
	let stripeCli: Stripe;

	const curUnix = new Date().getTime();

	beforeAll(async () => {
		stripeCli = ctx.stripeCli;

		await initProductsV0({
			ctx,
			products: [pro, messageAddOn],
			prefix: testCase,
			customerId,
		});

		const { testClockId: testClockId1 } = await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		testClockId = testClockId1!;
	});

	test("should attach pro product", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
		});
	});

	const initialUsage =
		messageItem.included_usage + messageItem.usage_limit! + 1000;

	test("should track more messages than limit and not surpass", async () => {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: initialUsage,
		});

		const check = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		const customer = await autumn.customers.get(customerId);

		const expectedBalance =
			messageItem.included_usage - messageItem.usage_limit!;

		expect(check.balance).toBe(expectedBalance);
		expect(check.allowed).toBe(false);

		expect(check.usage_limit!).toBe(messageItem.usage_limit!);
		expect(customer.features[TestFeature.Messages].usage_limit).toBe(
			messageItem.usage_limit!,
		);
	});

	return;

	test("should purchase add ons and have correct check results", async () => {
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

		expect(check.balance).toBe(expectedBalance);
		expect(check.allowed).toBe(true);

		expect(check.usage_limit!).toBe(
			messageItem.usage_limit! + addOnMessages.included_usage,
		);

		expect(customer.features[TestFeature.Messages].usage_limit).toBe(
			messageItem.usage_limit! + addOnMessages.included_usage,
		);
	});

	test("should use up all add ons and have correct check results", async () => {
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
		expect(check.balance).toBe(expectedBalance);
		expect(check.allowed).toBe(false);

		expect(check.usage_limit!).toBe(
			messageItem.usage_limit! + addOnMessages.included_usage,
		);

		expect(customer.features[TestFeature.Messages].usage_limit).toBe(
			messageItem.usage_limit! + addOnMessages.included_usage,
		);
	});
});
