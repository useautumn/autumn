import {
	type Customer,
	LegacyVersion,
	type LimitedItem,
	RolloverDuration,
} from "@autumn/shared";
import { beforeAll, describe, expect, test } from "bun:test";
import chalk from "chalk";
import { addMonths } from "date-fns";
import type Stripe from "stripe";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils.js";

const rolloverConfig = {
	max: 500,
	length: 1,
	duration: RolloverDuration.Month,
};
const messagesItem = constructArrearProratedItem({
	featureId: TestFeature.Messages,
	includedUsage: 400,
	rolloverConfig,
}) as LimitedItem;

export const pro = constructProduct({
	items: [messagesItem],
	type: "pro",
	isDefault: false,
});

const testCase = "rollover3";

describe(`${chalk.yellowBright(`${testCase}: Testing rollovers for usage price feature`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;
	let customer: Customer;
	let stripeCli: Stripe;

	const curUnix = new Date().getTime();

	beforeAll(async () => {
		stripeCli = ctx.stripeCli;

		await initProductsV0({
			ctx,
			products: [pro],
			prefix: testCase,
			customerId,
		});

		const res = await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		testClockId = res.testClockId!;
		customer = res.customer;
	});

	test("should attach pro product", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});
	});

	const rollover = 250;
	let curBalance = messagesItem.included_usage;

	test("should create track messages, reset, and have correct rollover", async () => {
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

		const cus = await autumn.customers.get(customerId);
		const msgesFeature = cus.features[TestFeature.Messages];

		const expectedBalance = messagesItem.included_usage + rollover;

		expect(msgesFeature).toBeDefined();
		expect(msgesFeature?.balance).toBe(expectedBalance);
		// @ts-expect-error
		expect(msgesFeature?.rollovers[0].balance).toBe(rollover);
		curBalance = expectedBalance;

		// Verify non-cached customer balance
		await timeout(2000);
		const nonCachedCustomer = await autumn.customers.get(customerId, {
			skip_cache: "true",
		});
		const nonCachedMsgesFeature = nonCachedCustomer.features[TestFeature.Messages];
		expect(nonCachedMsgesFeature?.balance).toBe(expectedBalance);
		// @ts-expect-error
		expect(nonCachedMsgesFeature?.rollovers[0].balance).toBe(rollover);
	});
});
