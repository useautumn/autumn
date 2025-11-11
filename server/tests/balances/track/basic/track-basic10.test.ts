import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type LimitedItem } from "@autumn/shared";
import chalk from "chalk";
import { TestFeature } from "@tests/setup/v2Features.js";
import { timeout } from "@tests/utils/genUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	constructArrearItem,
	constructFeatureItem,
} from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "track-basic10";
const customerId = testCase;

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
		await initProductsV0({
			ctx,
			products: [monthlyProduct],
			prefix: testCase,
			customerId,
		});

		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
			attachPm: "success",
		});

		// Attach monthly product first
		await autumnV1.attach({
			customer_id: customerId,
			product_id: monthlyProduct.id,
		});
	});

	test("should have correct initial balances", async () => {
		const customer = await autumnV1.customers.get(customerId);
		const msgesFeature = customer.features[TestFeature.Messages];

		expect(msgesFeature.balance).toBe(
			monthlyMsges.included_usage + lifetimeMsges.included_usage,
		);
		expect(msgesFeature.usage).toBe(0);

		const monthlyBreakdown = msgesFeature.breakdown?.find(
			(b: any) => b.interval === "month",
		);
		const lifetimeBreakdown = msgesFeature.breakdown?.find(
			(b: any) => b.interval === "lifetime",
		);

		expect(monthlyBreakdown?.balance).toBe(monthlyMsges.included_usage);
		expect(monthlyBreakdown?.usage).toBe(0);
		expect(lifetimeBreakdown?.balance).toBe(lifetimeMsges.included_usage);
		expect(lifetimeBreakdown?.usage).toBe(0);

		// Verify top-level balance equals sum of breakdown balances
		const sumOfBreakdownBalances =
			(monthlyBreakdown?.balance ?? 0) + (lifetimeBreakdown?.balance ?? 0);
		expect(msgesFeature.balance).toBe(sumOfBreakdownBalances);
	});

	const currentUsage = 40;

	test("should deduct from monthly first", async () => {
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: currentUsage,
			overage_behavior: "reject",
		});

		const customer = await autumnV1.customers.get(customerId);
		const msgesFeature = customer.features[TestFeature.Messages];

		// Check top-level balance and usage
		expect(msgesFeature.balance).toBe(
			monthlyMsges.included_usage + lifetimeMsges.included_usage - currentUsage,
		);
		expect(msgesFeature.usage).toBe(currentUsage);

		// Check breakdown balances and usage
		const monthlyBreakdown = msgesFeature.breakdown?.find(
			(b: any) => b.interval === "month",
		);
		const lifetimeBreakdown = msgesFeature.breakdown?.find(
			(b: any) => b.interval === "lifetime",
		);

		expect(monthlyBreakdown?.balance).toBe(
			monthlyMsges.included_usage - currentUsage,
		);
		expect(monthlyBreakdown?.usage).toBe(currentUsage);
		expect(lifetimeBreakdown?.balance).toBe(lifetimeMsges.included_usage);
		expect(lifetimeBreakdown?.usage).toBe(0);

		// Verify top-level balance equals sum of breakdown balances
		const sumOfBreakdownBalances =
			(monthlyBreakdown?.balance ?? 0) + (lifetimeBreakdown?.balance ?? 0);
		expect(msgesFeature.balance).toBe(sumOfBreakdownBalances);
	});

	const usage2 = 50; // 10 from monthly, 40 from lifetime
	test("should deduct from monthly and lifetime in correct order", async () => {
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: usage2,
			overage_behavior: "reject",
		});

		const customer = await autumnV1.customers.get(customerId);
		const msgesFeature = customer.features[TestFeature.Messages];

		// Check top-level balance and usage
		expect(msgesFeature.balance).toBe(10);
		expect(msgesFeature.usage).toBe(currentUsage + usage2);

		// Check breakdown balances and usage
		const monthlyBreakdown = msgesFeature.breakdown?.find(
			(b: any) => b.interval === "month",
		);
		const lifetimeBreakdown = msgesFeature.breakdown?.find(
			(b: any) => b.interval === "lifetime",
		);

		expect(monthlyBreakdown?.balance).toBe(0);
		expect(monthlyBreakdown?.usage).toBe(monthlyMsges.included_usage);
		expect(lifetimeBreakdown?.balance).toBe(10);
		expect(lifetimeBreakdown?.usage).toBe(40);

		// Verify top-level balance equals sum of breakdown balances
		const sumOfBreakdownBalances =
			(monthlyBreakdown?.balance ?? 0) + (lifetimeBreakdown?.balance ?? 0);
		expect(msgesFeature.balance).toBe(sumOfBreakdownBalances);
	});

	const usage3 = 50; // 10 from lifetime, 40 from monthly overage
	test("should deduct from lifetime and monthly in correct order", async () => {
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: usage3,
			overage_behavior: "reject",
		});

		const customer = await autumnV1.customers.get(customerId);
		const msgesFeature = customer.features[TestFeature.Messages];

		// Check top-level balance and usage
		expect(msgesFeature.balance).toBe(-40);
		expect(msgesFeature.usage).toBe(currentUsage + usage2 + usage3);

		// Check breakdown balances and usage
		const monthlyBreakdown = msgesFeature.breakdown?.find(
			(b: any) => b.interval === "month",
		);
		const lifetimeBreakdown = msgesFeature.breakdown?.find(
			(b: any) => b.interval === "lifetime",
		);

		expect(monthlyBreakdown?.balance).toBe(-40);
		expect(monthlyBreakdown?.usage).toBe(monthlyMsges.included_usage + 40);
		expect(lifetimeBreakdown?.balance).toBe(0);
		expect(lifetimeBreakdown?.usage).toBe(lifetimeMsges.included_usage);

		// Verify top-level balance equals sum of breakdown balances
		const sumOfBreakdownBalances =
			(monthlyBreakdown?.balance ?? 0) + (lifetimeBreakdown?.balance ?? 0);
		expect(msgesFeature.balance).toBe(sumOfBreakdownBalances);
	});

	test("should reflect overage balance in non-cached customer after 2s", async () => {
		// Wait 2 seconds for DB sync
		await timeout(2000);

		// Fetch customer with skip_cache=true
		const customer = await autumnV1.customers.get(customerId, {
			skip_cache: "true",
		});
		const msgesFeature = customer.features[TestFeature.Messages];

		// Verify top-level balance and usage
		expect(msgesFeature.balance).toBe(-40);
		expect(msgesFeature.usage).toBe(currentUsage + usage2 + usage3);

		// Verify breakdown balances and usage
		const monthlyBreakdown = msgesFeature.breakdown?.find(
			(b: any) => b.interval === "month",
		);
		const lifetimeBreakdown = msgesFeature.breakdown?.find(
			(b: any) => b.interval === "lifetime",
		);

		expect(monthlyBreakdown?.balance).toBe(-40);
		expect(monthlyBreakdown?.usage).toBe(monthlyMsges.included_usage + 40);
		expect(lifetimeBreakdown?.balance).toBe(0);
		expect(lifetimeBreakdown?.usage).toBe(lifetimeMsges.included_usage);

		// Verify top-level balance equals sum of breakdown balances
		const sumOfBreakdownBalances =
			(monthlyBreakdown?.balance ?? 0) + (lifetimeBreakdown?.balance ?? 0);
		expect(msgesFeature.balance).toBe(sumOfBreakdownBalances);
	});
});
