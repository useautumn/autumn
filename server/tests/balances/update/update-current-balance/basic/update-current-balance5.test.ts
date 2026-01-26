import { beforeAll, describe, expect, test } from "bun:test";
import { type ApiCustomer, ApiVersion, type LimitedItem } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

/**
 * Test: Update balance with decimal values (credits feature)
 *
 * Scenario:
 * 1. Attach credits feature with 100 credits
 * 2. Track 27.35 credits
 * 3. Update to 50.50
 * 4. Verify decimal precision is maintained
 */

const creditsFeature = constructFeatureItem({
	featureId: TestFeature.Credits,
	includedUsage: 100,
}) as LimitedItem;

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [creditsFeature],
});

const testCase = "update-current-balance5";

describe(`${chalk.yellowBright("update-current-balance5: update balance with decimal values (credits)")}`, () => {
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
			products: [freeProd],
			prefix: testCase,
		});

		await autumnV2.attach({
			customer_id: customerId,
			product_id: freeProd.id,
		});
	});

	test("update current_balance to decimal value 72.65", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			current_balance: 72.65,
		});

		const customerV2 = await autumnV2.customers.get<ApiCustomer>(customerId);
		const balance = customerV2.balances[TestFeature.Credits];

		expect(balance).toMatchObject({
			granted_balance: 72.65,
			current_balance: 72.65,
			usage: 0,
			purchased_balance: 0,
		});

		// Verify DB sync
		const customerFromDb = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{ skip_cache: "true" },
		);
		const balanceFromDb = customerFromDb.balances[TestFeature.Credits];

		expect(balanceFromDb).toMatchObject({
			granted_balance: 72.65,
			current_balance: 72.65,
			usage: 0,
			purchased_balance: 0,
		});
	});

	test("track decimal value 27.35 then update to 50.50", async () => {
		await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			value: 27.35,
		});

		// Balance should be 45.30 now (72.65 - 27.35)
		const beforeUpdate = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(
			beforeUpdate.balances[TestFeature.Credits].current_balance,
		).toBeCloseTo(45.3, 2);
		expect(beforeUpdate.balances[TestFeature.Credits].usage).toBeCloseTo(
			27.35,
			2,
		);

		// Update to 50.50
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			current_balance: 50.5,
		});

		const customerV2 = await autumnV2.customers.get<ApiCustomer>(customerId);
		const balance = customerV2.balances[TestFeature.Credits];

		// granted_balance should be 77.85 (50.50 + 27.35 usage)
		expect(balance.granted_balance).toBeCloseTo(77.85, 2);
		expect(balance.current_balance).toBeCloseTo(50.5, 2);
		expect(balance.usage).toBeCloseTo(27.35, 2);
		expect(balance.purchased_balance).toBe(0);

		// Verify DB sync
		const customerFromDb = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{ skip_cache: "true" },
		);
		const balanceFromDb = customerFromDb.balances[TestFeature.Credits];

		expect(balanceFromDb.granted_balance).toBeCloseTo(77.85, 2);
		expect(balanceFromDb.current_balance).toBeCloseTo(50.5, 2);
		expect(balanceFromDb.usage).toBeCloseTo(27.35, 2);
	});

	test("update to very small decimal 0.01", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			current_balance: 0.01,
		});

		const customerV2 = await autumnV2.customers.get<ApiCustomer>(customerId);
		const balance = customerV2.balances[TestFeature.Credits];

		// granted_balance should be 27.36 (0.01 + 27.35 usage)
		expect(balance.granted_balance).toBeCloseTo(27.36, 2);
		expect(balance.current_balance).toBeCloseTo(0.01, 2);
		expect(balance.usage).toBeCloseTo(27.35, 2);

		// Verify DB sync
		const customerFromDb = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{ skip_cache: "true" },
		);
		const balanceFromDb = customerFromDb.balances[TestFeature.Credits];

		expect(balanceFromDb.granted_balance).toBeCloseTo(27.36, 2);
		expect(balanceFromDb.current_balance).toBeCloseTo(0.01, 2);
	});
});
