import { beforeAll, describe, expect, test } from "bun:test";
import {
	type Customer,
	LegacyVersion,
	type LimitedItem,
	ProductItemInterval,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { resetAndGetCusEnt } from "./rolloverTestUtils.js";

const rolloverConfig = {
	max: 500,
	length: 1,
	duration: RolloverExpiryDurationType.Month,
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

const testCase = "track-rollover1";
// , per entity and regular

describe(`${chalk.yellowBright(`${testCase}: Testing rollovers for feature item`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let customer: Customer;

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [free],
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

		customer = res.customer;
	});

	test("should attach free product", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: free.id,
		});
	});

	const messageUsage = 250;
	let curBalance = messagesItem.included_usage;

	test("should create track messages, reset, and have correct rollover", async () => {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messageUsage,
		});

		await timeout(3000);

		await resetAndGetCusEnt({
			db: ctx.db,
			customer,
			productGroup: free.group!,
			featureId: TestFeature.Messages,
		});

		const cus = await autumn.customers.get(customerId);
		const msgesFeature = cus.features[TestFeature.Messages];

		const expectedRollover = Math.min(
			messagesItem.included_usage - messageUsage,
			rolloverConfig.max,
		);

		const expectedBalance = messagesItem.included_usage + expectedRollover;

		expect(msgesFeature).toBeDefined();
		expect(msgesFeature?.balance).toBe(expectedBalance);
		// @ts-expect-error
		expect(msgesFeature?.rollovers[0].balance).toBe(expectedRollover);
		curBalance = expectedBalance;

		// Verify non-cached customer balance
		await timeout(2000);
		const nonCachedCustomer = await autumn.customers.get(customerId, {
			skip_cache: "true",
		});
		const nonCachedMsgesFeature =
			nonCachedCustomer.features[TestFeature.Messages];
		expect(nonCachedMsgesFeature?.balance).toBe(expectedBalance);
		// @ts-expect-error
		expect(nonCachedMsgesFeature?.rollovers[0].balance).toBe(expectedRollover);
	});

	// let usage2 = 50;
	test("should reset again and have correct rollover", async () => {
		await resetAndGetCusEnt({
			db: ctx.db,
			customer,
			productGroup: free.group!,
			featureId: TestFeature.Messages,
		});

		const expectedRollover = Math.min(curBalance, rolloverConfig.max);
		const expectedBalance = messagesItem.included_usage + expectedRollover;

		const cus = await autumn.customers.get(customerId);
		const msgesFeature = cus.features[TestFeature.Messages];

		expect(msgesFeature).toBeDefined();
		expect(msgesFeature?.balance).toBe(expectedBalance);

		// @ts-expect-error (oldest rollover should be 100 (150 - 50))
		expect(msgesFeature?.rollovers[0].balance).toBe(100);
		// @ts-expect-error (newest rollover should be 400 (msges.included_usage))
		expect(msgesFeature?.rollovers[1].balance).toBe(400);

		// Verify non-cached customer balance
		await timeout(2000);
		const nonCachedCustomer = await autumn.customers.get(customerId, {
			skip_cache: "true",
		});
		const nonCachedMsgesFeature =
			nonCachedCustomer.features[TestFeature.Messages];
		expect(nonCachedMsgesFeature?.balance).toBe(expectedBalance);
		// @ts-expect-error
		expect(nonCachedMsgesFeature?.rollovers[0].balance).toBe(100);
		// @ts-expect-error
		expect(nonCachedMsgesFeature?.rollovers[1].balance).toBe(400);
	});

	test("should track messages and deduct from rollovers first", async () => {
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

		expect(rollover1.balance).toBe(0);
		expect(rollover2.balance).toBe(350);

		// Verify non-cached customer balance
		await timeout(2000);
		const nonCachedCustomer = await autumn.customers.get(customerId, {
			skip_cache: "true",
		});
		const nonCachedMsgesFeature =
			nonCachedCustomer.features[TestFeature.Messages];
		// @ts-expect-error
		const nonCachedRollover1 = nonCachedMsgesFeature?.rollovers[0];
		// @ts-expect-error
		const nonCachedRollover2 = nonCachedMsgesFeature?.rollovers[1];
		expect(nonCachedRollover1.balance).toBe(0);
		expect(nonCachedRollover2.balance).toBe(350);
	});

	test("should track and deduct from rollover + original balance", async () => {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 400,
		});

		await timeout(3000);

		const cus = await autumn.customers.get(customerId);
		const msgesFeature = cus.features[TestFeature.Messages];

		const rollovers = msgesFeature.rollovers;
		expect(rollovers![0].balance).toBe(0);
		expect(rollovers![1].balance).toBe(0);
		expect(msgesFeature.balance).toBe(messagesItem.included_usage - 50);

		// Verify non-cached customer balance
		await timeout(2000);
		const nonCachedCustomer = await autumn.customers.get(customerId, {
			skip_cache: "true",
		});
		const nonCachedMsgesFeature =
			nonCachedCustomer.features[TestFeature.Messages];
		const nonCachedRollovers = nonCachedMsgesFeature.rollovers;
		expect(nonCachedRollovers![0].balance).toBe(0);
		expect(nonCachedRollovers![1].balance).toBe(0);
		expect(nonCachedMsgesFeature.balance).toBe(
			messagesItem.included_usage - 50,
		);
	});
});
