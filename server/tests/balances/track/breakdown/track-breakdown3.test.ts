import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCustomer,
	ApiVersion,
	type CheckResponseV2,
	EntInterval,
	type TrackResponseV2,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { timeout } from "@tests/utils/genUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	constructArrearItem,
	constructFeatureItem,
} from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

/**
 * Test: Monthly pay-per-use messages + Lifetime messages deduction order
 * Expected deduction order:
 * 1. Monthly pay-per-use prepaid balance (shorter interval)
 * 2. Lifetime prepaid balance (longer interval)
 * 3. Monthly pay-per-use overage (after all prepaid exhausted)
 */

const monthlyPayPerUseMessages = constructArrearItem({
	featureId: TestFeature.Messages,
	includedUsage: 500,
	price: 0.01,
	billingUnits: 1,
});

const lifetimeMessages = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 200,
	interval: null, // lifetime
});

const payPerUseProd = constructProduct({
	type: "free",
	id: "pay-per-use-prod",
	isDefault: false,
	items: [monthlyPayPerUseMessages],
});

const lifetimeProd = constructProduct({
	type: "free",
	id: "lifetime-prod",
	isAddOn: true,
	isDefault: false,
	items: [lifetimeMessages],
});

const testCase = "track-breakdown3";

describe(`${chalk.yellowBright("track-breakdown3: pay-per-use + lifetime deduction order")}`, () => {
	const customerId = testCase;
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			attachPm: "success", // Required for pay-per-use
			withTestClock: false,
		});

		await initProductsV0({
			ctx,
			products: [payPerUseProd, lifetimeProd],
			prefix: testCase,
		});

		// Attach both products
		await autumnV2.attach({
			customer_id: customerId,
			product_id: payPerUseProd.id,
		});

		await autumnV2.attach({
			customer_id: customerId,
			product_id: lifetimeProd.id,
		});
	});

	test("should have initial balance of 700 (500 pay-per-use + 200 lifetime)", async () => {
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(res.balance).toMatchObject({
			granted_balance: 700,
			current_balance: 700,
			usage: 0,
			overage_allowed: true, // pay-per-use allows overage
		});

		expect(res.balance?.breakdown).toHaveLength(2);

		// V1 API verification
		const customer = await autumnV1.customers.get(customerId);
		const msgesFeature = customer.features[TestFeature.Messages];

		expect(msgesFeature.balance).toBe(700);
		expect(msgesFeature.usage).toBe(0);

		// V1 breakdown uses 'interval' field
		const monthlyBreakdown = msgesFeature.breakdown?.find(
			(b) => b.interval === EntInterval.Month,
		);
		const lifetimeBreakdown = msgesFeature.breakdown?.find(
			(b) => b.interval === EntInterval.Lifetime,
		);

		expect(monthlyBreakdown?.balance).toBe(500);
		expect(lifetimeBreakdown?.balance).toBe(200);

		// Verify top-level balance equals sum of breakdown balances
		const sumOfBreakdownBalances =
			(monthlyBreakdown?.balance ?? 0) + (lifetimeBreakdown?.balance ?? 0);
		expect(msgesFeature.balance).toBe(sumOfBreakdownBalances);
	});

	test("deduct 100: should deduct from pay-per-use first (shorter interval)", async () => {
		const deductValue = 100;

		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: deductValue,
		});

		// Parent balance
		expect(trackRes.balance).toMatchObject({
			granted_balance: 700,
			current_balance: 600,
			usage: 100,
			purchased_balance: 0,
		});

		// Check breakdowns
		const breakdown = trackRes.balance?.breakdown;
		expect(breakdown).toHaveLength(2);

		const payPerUseBreakdown = breakdown?.find(
			(b) => b.overage_allowed === true,
		);
		const lifetimeBreakdown = breakdown?.find(
			(b) => b.overage_allowed === false,
		);

		// Pay-per-use should have 100 deducted
		expect(payPerUseBreakdown).toMatchObject({
			granted_balance: 500,
			current_balance: 400,
			usage: 100,
			purchased_balance: 0,
			plan_id: payPerUseProd.id,
		});

		// Lifetime should be untouched
		expect(lifetimeBreakdown).toMatchObject({
			granted_balance: 200,
			current_balance: 200,
			usage: 0,
			plan_id: lifetimeProd.id,
		});
	});

	test("deduct 500: exhaust pay-per-use prepaid (400 remaining), then deduct 100 from lifetime", async () => {
		const deductValue = 500;

		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: deductValue,
		});

		// After: pay-per-use has 0 current (400 deducted), lifetime has 100 current (100 deducted)
		// Total: 700 - 100 - 500 = 100 remaining

		expect(trackRes.balance).toMatchObject({
			granted_balance: 700,
			current_balance: 100,
			usage: 600, // 100 + 500
			purchased_balance: 0,
		});

		const breakdown = trackRes.balance?.breakdown;
		const payPerUseBreakdown = breakdown?.find(
			(b) => b.overage_allowed === true,
		);
		const lifetimeBreakdown = breakdown?.find(
			(b) => b.overage_allowed === false,
		);

		// Pay-per-use should be exhausted (prepaid portion)
		expect(payPerUseBreakdown).toMatchObject({
			granted_balance: 500,
			current_balance: 0,
			usage: 500,
			purchased_balance: 0,
		});

		// Lifetime should have 100 deducted
		expect(lifetimeBreakdown).toMatchObject({
			granted_balance: 200,
			current_balance: 100,
			usage: 100,
		});
	});

	test("deduct 200 more: exhaust lifetime (100 remaining), then 100 goes to pay-per-use overage", async () => {
		const deductValue = 200;

		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: deductValue,
		});

		// Lifetime has 100 remaining, so deduct 100 from lifetime, then 100 goes to overage
		// Total usage: 600 + 200 = 800
		// purchased_balance: 100 (overage)

		expect(trackRes.balance).toMatchObject({
			granted_balance: 700,
			current_balance: 0,
			usage: 800,
			purchased_balance: 100,
		});

		const breakdown = trackRes.balance?.breakdown;
		const payPerUseBreakdown = breakdown?.find(
			(b) => b.overage_allowed === true,
		);
		const lifetimeBreakdown = breakdown?.find(
			(b) => b.overage_allowed === false,
		);

		// Pay-per-use should have overage
		expect(payPerUseBreakdown).toMatchObject({
			granted_balance: 500,
			current_balance: 0,
			usage: 600, // 500 prepaid + 100 overage
			purchased_balance: 100,
		});

		// Lifetime should be exhausted
		expect(lifetimeBreakdown).toMatchObject({
			granted_balance: 200,
			current_balance: 0,
			usage: 200,
			purchased_balance: 0,
		});
	});

	test("verify DB sync with skip_cache=true", async () => {
		await timeout(2000);

		const customer = await autumnV2.customers.get<ApiCustomer>(customerId, {
			skip_cache: "true",
		});

		const balance = customer.balances[TestFeature.Messages];

		// Should match cached values
		expect(balance).toMatchObject({
			granted_balance: 700,
			current_balance: 0,
			usage: 800,
			purchased_balance: 100,
		});

		// Check breakdowns
		const breakdown = balance.breakdown;
		expect(breakdown).toHaveLength(2);

		const payPerUseBreakdown = breakdown?.find(
			(b) => b.overage_allowed === true,
		);
		const lifetimeBreakdown = breakdown?.find(
			(b) => b.overage_allowed === false,
		);

		expect(payPerUseBreakdown).toMatchObject({
			granted_balance: 500,
			current_balance: 0,
			usage: 600,
			purchased_balance: 100,
		});

		expect(lifetimeBreakdown).toMatchObject({
			granted_balance: 200,
			current_balance: 0,
			usage: 200,
			purchased_balance: 0,
		});

		// V1 API verification with skip_cache
		const customerV1 = await autumnV1.customers.get(customerId, {
			skip_cache: "true",
		});
		const msgesFeature = customerV1.features[TestFeature.Messages];

		// V1 balance = current_balance - purchased_balance for overage scenarios
		expect(msgesFeature.usage).toBe(800);

		// V1 breakdown uses 'interval' field
		const monthlyBreakdownV1 = msgesFeature.breakdown?.find(
			(b) => b.interval === EntInterval.Month,
		);
		const lifetimeBreakdownV1 = msgesFeature.breakdown?.find(
			(b) => b.interval === EntInterval.Lifetime,
		);

		expect(monthlyBreakdownV1?.usage).toBe(600);
		expect(lifetimeBreakdownV1?.usage).toBe(200);
		expect(lifetimeBreakdownV1?.balance).toBe(0);

		// Verify top-level balance equals sum of breakdown balances
		const sumOfBreakdownBalances =
			(monthlyBreakdownV1?.balance ?? 0) + (lifetimeBreakdownV1?.balance ?? 0);
		expect(msgesFeature.balance).toBe(sumOfBreakdownBalances);
	});

	test("check endpoint should also match after DB sync", async () => {
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		})) as unknown as CheckResponseV2;

		expect(res.balance).toMatchObject({
			granted_balance: 700,
			current_balance: 0,
			usage: 800,
			purchased_balance: 100,
		});
	});
});
