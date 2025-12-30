import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCustomer,
	ApiVersion,
	type CheckResponseV2,
	ProductItemInterval,
	type TrackResponseV2,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { timeout } from "@tests/utils/genUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

/**
 * Test: Two products with different monthly message balances
 * Both have same interval (monthly), so deduction order depends on which breakdown is processed first.
 * Deductions should be distributed across breakdowns with the same interval.
 */

const monthlyMessages1 = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 1000,
	interval: ProductItemInterval.Month,
});

const monthlyMessages2 = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 500,
	interval: ProductItemInterval.Month,
});

const prod1 = constructProduct({
	type: "free",
	id: "prod1",
	isDefault: false,
	items: [monthlyMessages1],
});

const prod2 = constructProduct({
	type: "free",
	id: "prod2",
	isAddOn: true,
	isDefault: false,
	items: [monthlyMessages2],
});

const testCase = "track-breakdown4";

describe(`${chalk.yellowBright("track-breakdown4: two monthly products deduction")}`, () => {
	const customerId = testCase;
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		await initProductsV0({
			ctx,
			products: [prod1, prod2],
			prefix: testCase,
		});

		// Attach both products
		await autumnV2.attach({
			customer_id: customerId,
			product_id: prod1.id,
		});

		await autumnV2.attach({
			customer_id: customerId,
			product_id: prod2.id,
		});
	});

	test("should have initial balance of 1500 (1000 + 500)", async () => {
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(res.balance).toMatchObject({
			granted_balance: 1500,
			current_balance: 1500,
			usage: 0,
			plan_id: null, // null when multiple products
		});

		expect(res.balance?.breakdown).toHaveLength(2);
	});

	test("deduct 500: should deduct from one of the monthly breakdowns", async () => {
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

		// Check breakdowns - total usage across breakdowns should be 500
		const breakdown = trackRes.balance?.breakdown;
		expect(breakdown).toHaveLength(2);

		const totalUsage = breakdown?.reduce((sum, b) => sum + (b.usage ?? 0), 0);
		expect(totalUsage).toBe(500);

		const totalCurrentBalance = breakdown?.reduce(
			(sum, b) => sum + (b.current_balance ?? 0),
			0,
		);
		expect(totalCurrentBalance).toBe(1000);
	});

	test("deduct 800 more: should span across both breakdowns", async () => {
		const deductValue = 800;

		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: deductValue,
		});

		// Total deducted: 500 + 800 = 1300
		// Remaining: 1500 - 1300 = 200

		expect(trackRes.balance).toMatchObject({
			granted_balance: 1500,
			current_balance: 200,
			usage: 1300,
			purchased_balance: 0,
		});

		// Check breakdowns
		const breakdown = trackRes.balance?.breakdown;
		expect(breakdown).toHaveLength(2);

		const totalUsage = breakdown?.reduce((sum, b) => sum + (b.usage ?? 0), 0);
		expect(totalUsage).toBe(1300);

		const totalCurrentBalance = breakdown?.reduce(
			(sum, b) => sum + (b.current_balance ?? 0),
			0,
		);
		expect(totalCurrentBalance).toBe(200);
	});

	test("deduct 200 more: should exhaust all balances", async () => {
		const deductValue = 200;

		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: deductValue,
		});

		// Total deducted: 1300 + 200 = 1500
		// All balances exhausted

		expect(trackRes.balance).toMatchObject({
			granted_balance: 1500,
			current_balance: 0,
			usage: 1500,
			purchased_balance: 0,
		});

		const breakdown = trackRes.balance?.breakdown;
		expect(breakdown).toHaveLength(2);

		const breakdown1 = breakdown?.find((b) => b.granted_balance === 1000);
		const breakdown2 = breakdown?.find((b) => b.granted_balance === 500);

		// Both should be exhausted
		expect(breakdown1).toMatchObject({
			granted_balance: 1000,
			current_balance: 0,
			usage: 1000,
		});

		expect(breakdown2).toMatchObject({
			granted_balance: 500,
			current_balance: 0,
			usage: 500,
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
			usage: 1500,
			purchased_balance: 0,
		});

		// Check breakdowns
		const breakdown = balance.breakdown;
		expect(breakdown).toHaveLength(2);

		const breakdown1 = breakdown?.find((b) => b.granted_balance === 1000);
		const breakdown2 = breakdown?.find((b) => b.granted_balance === 500);

		expect(breakdown1).toMatchObject({
			granted_balance: 1000,
			current_balance: 0,
			usage: 1000,
		});

		expect(breakdown2).toMatchObject({
			granted_balance: 500,
			current_balance: 0,
			usage: 500,
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
			usage: 1500,
			purchased_balance: 0,
		});
	});
});

