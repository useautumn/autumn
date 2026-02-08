import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCusFeatureV3,
	type Customer,
	LegacyVersion,
	type LimitedItem,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { addMonths } from "date-fns";
import type Stripe from "stripe";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const rolloverConfig = {
	max: 400,
	length: 1,
	duration: RolloverExpiryDurationType.Month,
};
const messagesItem = constructPrepaidItem({
	featureId: TestFeature.Messages,
	includedUsage: 300,
	billingUnits: 300,
	price: 10,
	rolloverConfig,
}) as LimitedItem;

export const pro = constructProduct({
	items: [messagesItem],
	type: "pro",
	isDefault: false,
});

const testCase = "track-rollover4";

describe(`${chalk.yellowBright(`${testCase}: Testing rollovers for prepaid messages`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;
	let customer: Customer;
	let stripeCli: Stripe;

	let curUnix = new Date().getTime();

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

	const paidQuantity = 300;
	const balance = paidQuantity + messagesItem.included_usage;
	const options = [
		{
			feature_id: TestFeature.Messages,
			quantity: paidQuantity,
		},
	];

	test("should attach pro product", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
			options,
		});
	});

	const rollover = 250;
	test("should create track messages, reset, and have correct rollover", async () => {
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
		const msgesFeature = cus.features[TestFeature.Messages] as ApiCusFeatureV3;

		const rollovers = msgesFeature?.rollovers;
		expect(msgesFeature).toBeDefined();
		expect(msgesFeature?.balance).toBe(balance + rollover);
		expect(rollovers?.[0].balance).toBe(rollover);

		// Verify non-cached customer balance
		await timeout(2000);
		const nonCachedCustomer = await autumn.customers.get(customerId, {
			skip_cache: "true",
		});
		const nonCachedMsgesFeature = nonCachedCustomer.features[
			TestFeature.Messages
		] as ApiCusFeatureV3;
		const nonCachedRollovers = nonCachedMsgesFeature?.rollovers;
		expect(nonCachedMsgesFeature?.balance).toBe(balance + rollover);
		expect(nonCachedRollovers?.[0].balance).toBe(rollover);
	});
});
