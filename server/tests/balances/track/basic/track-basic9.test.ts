import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type LimitedItem } from "@autumn/shared";
import chalk from "chalk";
import { TestFeature } from "tests/setup/v2Features.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	constructArrearItem,
	constructFeatureItem,
} from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "track-basic9";
const customerId = `${testCase}`;

// Monthly pay-per-use: 50 included, overage allowed
const monthlyMsges = constructArrearItem({
	featureId: TestFeature.Messages,
	includedUsage: 50,
	price: 0.01,
	billingUnits: 1,
}) as LimitedItem;

// Lifetime one-off: 30 included, no overage
const lifetimeMsges = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 50,
	interval: null,
}) as LimitedItem;

const monthlyProduct = constructProduct({
	id: "pro",
	items: [monthlyMsges, lifetimeMsges],
	type: "pro",
	isDefault: false,
});

describe(`${chalk.yellowBright(`${testCase}: Testing deduction order with monthly pay-per-use and lifetime one-off`)}`, () => {
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [monthlyProduct],
			prefix: testCase,
		});

		// Attach monthly product first
		await autumnV1.attach({
			customer_id: customerId,
			product_id: monthlyProduct.id,
		});
	});

	test("should have correct initial balances", async () => {
		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Messages].balance;

		expect(balance).toBe(
			monthlyMsges.included_usage + lifetimeMsges.included_usage,
		);
	});

	const currentUsage = 40;

	test("should deduct from monthly first", async () => {
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: currentUsage,
			overage_behaviour: "reject",
		});

		const customer = await autumnV1.customers.get(customerId);
		const msgesFeature = customer.features[TestFeature.Messages];
		// Get monthly balance
		const monthlyBalance = msgesFeature.breakdown?.find(
			(b: any) => b.interval === "month",
		)?.balance;
		const lifetimeBalance = msgesFeature.breakdown?.find(
			(b: any) => b.interval === "lifetime",
		)?.balance;

		console.log("monthly balance:", monthlyBalance);
		console.log("included usage:", monthlyMsges.included_usage);

		expect(monthlyBalance).toBe(monthlyMsges.included_usage - currentUsage);
		expect(lifetimeBalance).toBe(lifetimeMsges.included_usage);
	});

	const usage2 = 50; // 10 from monthly, 40 from lifetime
	test("should deduct from monthly and lifetime in correct order", async () => {
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: usage2,
			overage_behaviour: "reject",
		});

		const customer = await autumnV1.customers.get(customerId);
		const msgesBalance = customer.features[TestFeature.Messages];

		const monthlyBalance = msgesBalance.breakdown?.find(
			(b: any) => b.interval === "month",
		)?.balance;
		const lifetimeBalance = msgesBalance.breakdown?.find(
			(b: any) => b.interval === "lifetime",
		)?.balance;

		expect(monthlyBalance).toBe(0);
		expect(lifetimeBalance).toBe(10);
	});

	const usage3 = 50; // 10 from lifetime, 40 from monthly
	test("should deduct from lifetime and monthly in correct order", async () => {
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: usage3,
			overage_behaviour: "reject",
		});

		const customer = await autumnV1.customers.get(customerId);
		const msgesBalance = customer.features[TestFeature.Messages];

		const monthlyBalance = msgesBalance.breakdown?.find(
			(b: any) => b.interval === "month",
		)?.balance;
		const lifetimeBalance = msgesBalance.breakdown?.find(
			(b: any) => b.interval === "lifetime",
		)?.balance;

		expect(lifetimeBalance).toBe(0);
		expect(monthlyBalance).toBe(-40);
	});
});
