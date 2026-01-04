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
 * Test: update-filters4
 *
 * Tests filtering balance updates by interval.
 *
 * Scenario:
 * - Product A: Monthly messages (100)
 * - Product B: Lifetime messages (200)
 * - Update only monthly breakdown using interval filter
 * - Update only lifetime breakdown using interval filter
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

const testCase = "update-filters4";

describe(`${chalk.yellowBright("update-filters4: filter by interval (monthly vs lifetime)")}`, () => {
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

	test("initial: customer has 300 with monthly (100) and lifetime (200)", async () => {
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 300,
			current_balance: 300,
			usage: 0,
		});

		const res = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		expect(res.balance?.breakdown).toHaveLength(2);

		const monthlyBreakdown = res.balance?.breakdown?.find(
			(b) => b.reset?.interval === "month",
		);
		const lifetimeBreakdown = res.balance?.breakdown?.find(
			(b) => b.reset?.interval === "one_off",
		);

		expect(monthlyBreakdown?.granted_balance).toBe(100);
		expect(lifetimeBreakdown?.granted_balance).toBe(200);
	});

	test("update only monthly breakdown (100 → 75) using interval filter", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 75,
			interval: ResetInterval.Month,
		});

		const res = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		// Total should be 275 (75 + 200)
		expect(res.balance).toMatchObject({
			granted_balance: 275,
			current_balance: 275,
			usage: 0,
		});

		// Monthly breakdown should be updated
		const monthlyBreakdown = res.balance?.breakdown?.find(
			(b) => b.reset?.interval === "month",
		);
		expect(monthlyBreakdown?.granted_balance).toBe(75);
		expect(monthlyBreakdown?.current_balance).toBe(75);

		// Lifetime breakdown should be unchanged
		const lifetimeBreakdown = res.balance?.breakdown?.find(
			(b) => b.reset?.interval === "one_off",
		);
		expect(lifetimeBreakdown?.granted_balance).toBe(200);
		expect(lifetimeBreakdown?.current_balance).toBe(200);
	});

	test("update only lifetime breakdown (200 → 150) using interval filter", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 150,
			interval: ResetInterval.OneOff,
		});

		const res = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		// Total should be 225 (75 + 150)
		expect(res.balance).toMatchObject({
			granted_balance: 225,
			current_balance: 225,
			usage: 0,
		});

		// Monthly breakdown should be unchanged
		const monthlyBreakdown = res.balance?.breakdown?.find(
			(b) => b.reset?.interval === "month",
		);
		expect(monthlyBreakdown?.granted_balance).toBe(75);
		expect(monthlyBreakdown?.current_balance).toBe(75);

		// Lifetime breakdown should be updated
		const lifetimeBreakdown = res.balance?.breakdown?.find(
			(b) => b.reset?.interval === "one_off",
		);
		expect(lifetimeBreakdown?.granted_balance).toBe(150);
		expect(lifetimeBreakdown?.current_balance).toBe(150);
	});

	test("increase monthly breakdown (75 → 125) using interval filter", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 125,
			interval: ResetInterval.Month,
		});

		const res = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		// Total should be 275 (125 + 150)
		expect(res.balance).toMatchObject({
			granted_balance: 275,
			current_balance: 275,
			usage: 0,
		});

		// Monthly breakdown should be updated
		const monthlyBreakdown = res.balance?.breakdown?.find(
			(b) => b.reset?.interval === "month",
		);
		expect(monthlyBreakdown?.granted_balance).toBe(125);
		expect(monthlyBreakdown?.current_balance).toBe(125);
	});

	test("increase lifetime breakdown (150 → 300) using interval filter", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 300,
			interval: ResetInterval.OneOff,
		});

		const res = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		// Total should be 425 (125 + 300)
		expect(res.balance).toMatchObject({
			granted_balance: 425,
			current_balance: 425,
			usage: 0,
		});

		// Lifetime breakdown should be updated
		const lifetimeBreakdown = res.balance?.breakdown?.find(
			(b) => b.reset?.interval === "one_off",
		);
		expect(lifetimeBreakdown?.granted_balance).toBe(300);
		expect(lifetimeBreakdown?.current_balance).toBe(300);
	});

	test("verify database state matches cache", async () => {
		// Wait for database sync
		await new Promise((resolve) => setTimeout(resolve, 2000));

		const customerFromDb = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{ skip_cache: "true" },
		);

		expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 425,
			current_balance: 425,
			usage: 0,
		});
	});
});
