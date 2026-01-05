import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCustomer,
	ApiVersion,
	type CheckResponseV2,
	ProductItemInterval,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

/**
 * Test: Update balance with interval filter (monthly vs lifetime)
 *
 * Scenario:
 * - Product A: 100 messages (monthly)
 * - Product B: 200 messages (lifetime)
 * - Total: 300 messages
 *
 * Tests:
 * 1. Update with interval: "month" filter - only monthly breakdown affected
 * 2. Update with interval: "lifetime" filter - only lifetime breakdown affected
 */

const monthlyMessages = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
	interval: ProductItemInterval.Month,
});

const lifetimeMessages = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 200,
	interval: null,
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
	isDefault: false,
	isAddOn: true,
	items: [lifetimeMessages],
});

const testCase = "update-current-balance-breakdown2";

describe(`${chalk.yellowBright("update-current-balance-breakdown2: filter by interval")}`, () => {
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

		await autumnV2.attach({
			customer_id: customerId,
			product_id: monthlyProd.id,
		});
		await autumnV2.attach({
			customer_id: customerId,
			product_id: lifetimeProd.id,
		});
	});

	test("initial: customer has 300 with 2 breakdown items", async () => {
		const res = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		expect(res.balance).toMatchObject({
			granted_balance: 300,
			current_balance: 300,
			usage: 0,
		});

		expect(res.balance?.breakdown).toHaveLength(2);
	});

	test("update with interval: month filter - only monthly affected", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 50,
			interval: ResetInterval.Month,
		});

		const res = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		// Total should be 250 (50 monthly + 200 lifetime)
		expect(res.balance).toMatchObject({
			granted_balance: 250,
			current_balance: 250,
			usage: 0,
		});

		// Verify breakdown: monthly should be 50, lifetime should be 200
		const breakdowns = res.balance?.breakdown ?? [];
		const monthlyBreakdown = breakdowns.find(
			(b) => b.reset?.interval === "month",
		);
		const lifetimeBreakdown = breakdowns.find(
			(b) => b.reset?.interval === ResetInterval.OneOff,
		);

		expect(monthlyBreakdown?.granted_balance).toBe(50);
		expect(monthlyBreakdown?.current_balance).toBe(50);
		expect(lifetimeBreakdown?.granted_balance).toBe(200);
		expect(lifetimeBreakdown?.current_balance).toBe(200);

		// Verify DB sync
		const customerFromDb = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{ skip_cache: "true" },
		);
		expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 250,
			current_balance: 250,
		});
	});

	test("update with interval: lifetime filter - only lifetime affected", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 100,
			interval: ResetInterval.OneOff,
		});

		const res = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		// Total should be 150 (50 monthly + 100 lifetime)
		expect(res.balance).toMatchObject({
			granted_balance: 150,
			current_balance: 150,
			usage: 0,
		});

		// Verify breakdown
		const breakdowns = res.balance?.breakdown ?? [];
		const monthlyBreakdown = breakdowns.find(
			(b) => b.reset?.interval === "month",
		);
		const lifetimeBreakdown = breakdowns.find(
			(b) => b.reset?.interval === ResetInterval.OneOff,
		);

		expect(monthlyBreakdown?.granted_balance).toBe(50);
		expect(lifetimeBreakdown?.granted_balance).toBe(100);
		expect(lifetimeBreakdown?.current_balance).toBe(100);

		// Verify DB sync
		const customerFromDb = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{ skip_cache: "true" },
		);
		expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 150,
			current_balance: 150,
		});
	});
});
