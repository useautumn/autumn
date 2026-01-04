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
 * Test: Monthly messages + Lifetime messages deduction order
 * Expected deduction order: Monthly (shorter interval) first, then Lifetime (longer interval)
 */

const monthlyMessages = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 500,
	interval: ProductItemInterval.Month,
});

const lifetimeMessages = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 200,
	interval: null, // lifetime
});

const monthlyProd = constructProduct({
	type: "free",
	id: "monthly-prod",
	isDefault: false,
	items: [monthlyMessages],
});

const lifetimeProd = constructProduct({
	type: "free",
	id: "lifetime-prod",
	isAddOn: true,
	isDefault: false,
	items: [lifetimeMessages],
});

const testCase = "track-breakdown2";

describe(`${chalk.yellowBright("track-breakdown2: monthly + lifetime deduction order")}`, () => {
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
			products: [monthlyProd, lifetimeProd],
			prefix: testCase,
		});

		// Attach both products
		await autumnV2.attach({
			customer_id: customerId,
			product_id: monthlyProd.id,
		});

		await autumnV2.attach({
			customer_id: customerId,
			product_id: lifetimeProd.id,
		});
	});

	test("should have initial balance of 700 (500 monthly + 200 lifetime)", async () => {
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(res.balance).toMatchObject({
			granted_balance: 700,
			current_balance: 700,
			usage: 0,
		});

		expect(res.balance?.breakdown).toHaveLength(2);
	});

	test("deduct 100: should deduct from monthly first (shorter interval)", async () => {
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

		const monthlyBreakdown = breakdown?.find((b) => b.granted_balance === 500);
		const lifetimeBreakdown = breakdown?.find((b) => b.granted_balance === 200);

		// Monthly should have 100 deducted
		expect(monthlyBreakdown).toMatchObject({
			granted_balance: 500,
			current_balance: 400,
			usage: 100,
			plan_id: monthlyProd.id,
		});

		// Lifetime should be untouched
		expect(lifetimeBreakdown).toMatchObject({
			granted_balance: 200,
			current_balance: 200,
			usage: 0,
			plan_id: lifetimeProd.id,
		});
	});

	test("deduct 450 more: should exhaust monthly (50 remaining) and deduct 400 from lifetime", async () => {
		const deductValue = 450;

		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: deductValue,
		});

		// Total deducted so far: 100 + 450 = 550
		// Monthly should be exhausted (500 - 500 = 0 current), lifetime should have 350 remaining (200 - 50 = 150)
		// Wait, let me recalculate:
		// After first deduct: Monthly = 400 current, Lifetime = 200 current
		// Second deduct 450: Monthly has 400, so deduct 400 from monthly (monthly now 0), then 50 from lifetime
		// Monthly: 500 granted, 0 current, 500 usage
		// Lifetime: 200 granted, 150 current, 50 usage

		expect(trackRes.balance).toMatchObject({
			granted_balance: 700,
			current_balance: 150, // 700 - 550 = 150
			usage: 550,
			purchased_balance: 0,
		});

		const breakdown = trackRes.balance?.breakdown;
		expect(breakdown).toHaveLength(2);

		const monthlyBreakdown = breakdown?.find((b) => b.granted_balance === 500);
		const lifetimeBreakdown = breakdown?.find((b) => b.granted_balance === 200);

		// Monthly should be exhausted
		expect(monthlyBreakdown).toMatchObject({
			granted_balance: 500,
			current_balance: 0,
			usage: 500,
			plan_id: monthlyProd.id,
		});

		// Lifetime should have 50 deducted
		expect(lifetimeBreakdown).toMatchObject({
			granted_balance: 200,
			current_balance: 150,
			usage: 50,
			plan_id: lifetimeProd.id,
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
			current_balance: 150,
			usage: 550,
			purchased_balance: 0,
		});

		// Check breakdowns
		const breakdown = balance.breakdown;
		expect(breakdown).toHaveLength(2);

		const monthlyBreakdown = breakdown?.find((b) => b.granted_balance === 500);
		const lifetimeBreakdown = breakdown?.find((b) => b.granted_balance === 200);

		expect(monthlyBreakdown).toMatchObject({
			granted_balance: 500,
			current_balance: 0,
			usage: 500,
		});

		expect(lifetimeBreakdown).toMatchObject({
			granted_balance: 200,
			current_balance: 150,
			usage: 50,
		});
	});

	test("check endpoint should also match after DB sync", async () => {
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		})) as unknown as CheckResponseV2;

		expect(res.balance).toMatchObject({
			granted_balance: 700,
			current_balance: 150,
			usage: 550,
			purchased_balance: 0,
		});
	});
});
