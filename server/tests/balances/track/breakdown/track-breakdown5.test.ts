import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCustomer,
	ApiVersion,
	type CheckResponseV2,
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
 * Test: Prepaid monthly messages + Pay-per-use monthly messages
 * Both have same interval (monthly), but different overage_allowed.
 * Expected deduction order:
 * 1. Prepaid monthly (overage_allowed = false) first
 * 2. Pay-per-use monthly prepaid balance (overage_allowed = true)
 * 3. Pay-per-use monthly overage (after all prepaid exhausted)
 */

const prepaidMonthlyMessages = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 1000,
});

const payPerUseMonthlyMessages = constructArrearItem({
	featureId: TestFeature.Messages,
	includedUsage: 500,
	price: 0.01,
	billingUnits: 1,
});

const prepaidProd = constructProduct({
	type: "free",
	id: "prepaid-prod",
	isDefault: false,
	items: [prepaidMonthlyMessages],
});

const payPerUseProd = constructProduct({
	type: "free",
	id: "pay-per-use-prod",
	isAddOn: true,
	isDefault: false,
	items: [payPerUseMonthlyMessages],
});

const testCase = "track-breakdown5";

describe(`${chalk.yellowBright("track-breakdown5: prepaid + pay-per-use monthly deduction order")}`, () => {
	const customerId = testCase;
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
			products: [prepaidProd, payPerUseProd],
			prefix: testCase,
		});

		// Attach both products
		await autumnV2.attach({
			customer_id: customerId,
			product_id: prepaidProd.id,
		});

		await autumnV2.attach({
			customer_id: customerId,
			product_id: payPerUseProd.id,
		});
	});

	test("should have initial balance of 1500 (1000 prepaid + 500 pay-per-use)", async () => {
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(res.balance).toMatchObject({
			granted_balance: 1500,
			current_balance: 1500,
			usage: 0,
			overage_allowed: true, // true because pay-per-use allows overage
			plan_id: null,
		});

		expect(res.balance?.breakdown).toHaveLength(2);
	});

	test("deduct 500: should deduct from prepaid first (overage_allowed = false)", async () => {
		const deductValue = 500;

		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: deductValue,
		});

		// Parent balance
		expect(trackRes.balance).toMatchObject({
			granted_balance: 1500,
			current_balance: 1000,
			usage: 500,
			purchased_balance: 0,
		});

		// Check breakdowns
		const breakdown = trackRes.balance?.breakdown;
		expect(breakdown).toHaveLength(2);

		const prepaidBreakdown = breakdown?.find(
			(b) => b.overage_allowed === false,
		);
		const payPerUseBreakdown = breakdown?.find(
			(b) => b.overage_allowed === true,
		);

		// Prepaid should have 500 deducted
		expect(prepaidBreakdown).toMatchObject({
			granted_balance: 1000,
			current_balance: 500,
			usage: 500,
			purchased_balance: 0,
			plan_id: prepaidProd.id,
		});

		// Pay-per-use should be untouched
		expect(payPerUseBreakdown).toMatchObject({
			granted_balance: 500,
			current_balance: 500,
			usage: 0,
			purchased_balance: 0,
			plan_id: payPerUseProd.id,
		});
	});

	test("deduct 700: exhaust prepaid (500 remaining), then deduct 200 from pay-per-use prepaid", async () => {
		const deductValue = 700;

		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: deductValue,
		});

		// After first test: prepaid = 500 current, pay-per-use = 500 current
		// Deduct 700: prepaid covers 500, pay-per-use covers 200
		// Total usage: 500 + 700 = 1200

		expect(trackRes.balance).toMatchObject({
			granted_balance: 1500,
			current_balance: 300, // 1500 - 1200 = 300
			usage: 1200,
			purchased_balance: 0,
		});

		const breakdown = trackRes.balance?.breakdown;
		const prepaidBreakdown = breakdown?.find(
			(b) => b.overage_allowed === false,
		);
		const payPerUseBreakdown = breakdown?.find(
			(b) => b.overage_allowed === true,
		);

		// Prepaid should be exhausted
		expect(prepaidBreakdown).toMatchObject({
			granted_balance: 1000,
			current_balance: 0,
			usage: 1000,
			purchased_balance: 0,
		});

		// Pay-per-use should have 200 deducted from prepaid
		expect(payPerUseBreakdown).toMatchObject({
			granted_balance: 500,
			current_balance: 300,
			usage: 200,
			purchased_balance: 0,
		});
	});

	test("deduct 500: exhaust pay-per-use prepaid (300 remaining), then 200 goes to overage", async () => {
		const deductValue = 500;

		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: deductValue,
		});

		// After previous test: prepaid = 0 current, pay-per-use = 300 current
		// Deduct 500: pay-per-use prepaid covers 300, then 200 goes to overage
		// Total usage: 1200 + 500 = 1700

		expect(trackRes.balance).toMatchObject({
			granted_balance: 1500,
			current_balance: 0,
			usage: 1700,
			purchased_balance: 200, // overage
		});

		const breakdown = trackRes.balance?.breakdown;
		const prepaidBreakdown = breakdown?.find(
			(b) => b.overage_allowed === false,
		);
		const payPerUseBreakdown = breakdown?.find(
			(b) => b.overage_allowed === true,
		);

		// Prepaid should still be exhausted
		expect(prepaidBreakdown).toMatchObject({
			granted_balance: 1000,
			current_balance: 0,
			usage: 1000,
			purchased_balance: 0,
		});

		// Pay-per-use should be exhausted with overage
		expect(payPerUseBreakdown).toMatchObject({
			granted_balance: 500,
			current_balance: 0,
			usage: 700, // 500 prepaid + 200 overage
			purchased_balance: 200,
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
			granted_balance: 1500,
			current_balance: 0,
			usage: 1700,
			purchased_balance: 200,
		});

		// Check breakdowns
		const breakdown = balance.breakdown;
		expect(breakdown).toHaveLength(2);

		const prepaidBreakdown = breakdown?.find(
			(b) => b.overage_allowed === false,
		);
		const payPerUseBreakdown = breakdown?.find(
			(b) => b.overage_allowed === true,
		);

		expect(prepaidBreakdown).toMatchObject({
			granted_balance: 1000,
			current_balance: 0,
			usage: 1000,
			purchased_balance: 0,
		});

		expect(payPerUseBreakdown).toMatchObject({
			granted_balance: 500,
			current_balance: 0,
			usage: 700,
			purchased_balance: 200,
		});
	});

	test("check endpoint should also match after DB sync", async () => {
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		})) as unknown as CheckResponseV2;

		expect(res.balance).toMatchObject({
			granted_balance: 1500,
			current_balance: 0,
			usage: 1700,
			purchased_balance: 200,
		});
	});
});
