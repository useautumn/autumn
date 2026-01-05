import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCustomer,
	ApiVersion,
	type CheckResponseV2,
	ProductItemInterval,
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
 * Test: update-filters1
 *
 * Tests filtering balance updates by customer_entitlement_id.
 *
 * Scenario:
 * - 3 products, each with monthly messages (100, 150, 200)
 * - Attach all three to customer
 * - Get breakdown IDs
 * - Update each breakdown individually by customer_entitlement_id
 */

const messagesItemA = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
	interval: ProductItemInterval.Month,
});

const messagesItemB = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 150,
	interval: ProductItemInterval.Month,
});

const messagesItemC = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 200,
	interval: ProductItemInterval.Month,
});

const productA = constructProduct({
	type: "free",
	id: "prod-a",
	isDefault: false,
	items: [messagesItemA],
});

const productB = constructProduct({
	type: "free",
	id: "prod-b",
	isDefault: false,
	isAddOn: true,
	items: [messagesItemB],
});

const productC = constructProduct({
	type: "free",
	id: "prod-c",
	isDefault: false,
	isAddOn: true,
	items: [messagesItemC],
});

const testCase = "update-filters1";

describe(`${chalk.yellowBright("update-filters1: filter by customer_entitlement_id with 3 monthly products")}`, () => {
	const customerId = testCase;
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

	let breakdownIds: { id: string; grantedBalance: number }[] = [];

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		await initProductsV0({
			ctx,
			products: [productA, productB, productC],
			prefix: testCase,
		});

		await autumnV2.attach({ customer_id: customerId, product_id: productA.id });
		await autumnV2.attach({ customer_id: customerId, product_id: productB.id });
		await autumnV2.attach({ customer_id: customerId, product_id: productC.id });

		// Get breakdown IDs
		const res = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		breakdownIds =
			res.balance?.breakdown?.map((b) => ({
				id: b.id!,
				grantedBalance: b.granted_balance!,
			})) ?? [];
	});

	test("initial: customer has 450 with 3 breakdown items", async () => {
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 450,
			current_balance: 450,
			usage: 0,
		});

		expect(breakdownIds).toHaveLength(3);

		const balances = breakdownIds
			.map((b) => b.grantedBalance)
			.sort((a, b) => a - b);
		expect(balances).toEqual([100, 150, 200]);

		// All IDs should be unique
		const uniqueIds = new Set(breakdownIds.map((b) => b.id));
		expect(uniqueIds.size).toBe(3);
	});

	test("update first breakdown (100 → 80) by customer_entitlement_id", async () => {
		const targetBreakdown = breakdownIds.find((b) => b.grantedBalance === 100);
		expect(targetBreakdown).toBeDefined();

		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 80,
			customer_entitlement_id: targetBreakdown!.id,
		});

		const res = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		// Total should be 430 (80 + 150 + 200)
		expect(res.balance).toMatchObject({
			granted_balance: 430,
			current_balance: 430,
			usage: 0,
		});

		// Verify the specific breakdown was updated
		const updatedBreakdown = res.balance?.breakdown?.find(
			(b) => b.id === targetBreakdown!.id,
		);
		expect(updatedBreakdown?.granted_balance).toBe(80);
		expect(updatedBreakdown?.current_balance).toBe(80);

		// Verify other breakdowns unchanged
		const otherBreakdowns =
			res.balance?.breakdown?.filter((b) => b.id !== targetBreakdown!.id) ?? [];
		const otherBalances = otherBreakdowns
			.map((b) => b.granted_balance)
			.sort((a, b) => (a ?? 0) - (b ?? 0));
		expect(otherBalances).toEqual([150, 200]);

		// Update local cache of breakdown info
		breakdownIds = breakdownIds.map((b) =>
			b.id === targetBreakdown!.id ? { ...b, grantedBalance: 80 } : b,
		);
	});

	test("update second breakdown (150 → 200) by customer_entitlement_id", async () => {
		const targetBreakdown = breakdownIds.find((b) => b.grantedBalance === 150);
		expect(targetBreakdown).toBeDefined();

		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 200,
			customer_entitlement_id: targetBreakdown!.id,
		});

		const res = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		// Total should be 480 (80 + 200 + 200)
		expect(res.balance).toMatchObject({
			granted_balance: 480,
			current_balance: 480,
			usage: 0,
		});

		// Verify the specific breakdown was updated
		const updatedBreakdown = res.balance?.breakdown?.find(
			(b) => b.id === targetBreakdown!.id,
		);
		expect(updatedBreakdown?.granted_balance).toBe(200);
		expect(updatedBreakdown?.current_balance).toBe(200);

		// Update local cache
		breakdownIds = breakdownIds.map((b) =>
			b.id === targetBreakdown!.id ? { ...b, grantedBalance: 200 } : b,
		);
	});

	test("update third breakdown (200 → 50) by customer_entitlement_id", async () => {
		// Find the original 200 breakdown (not the one we just updated to 200)
		const originalBreakdownC = breakdownIds.find(
			(b) => b.grantedBalance === 200 && b.id !== breakdownIds[1].id,
		);
		expect(originalBreakdownC).toBeDefined();

		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 50,
			customer_entitlement_id: originalBreakdownC!.id,
		});

		const res = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		// Total should be 330 (80 + 200 + 50)
		expect(res.balance).toMatchObject({
			granted_balance: 330,
			current_balance: 330,
			usage: 0,
		});

		// Verify the specific breakdown was updated
		const updatedBreakdown = res.balance?.breakdown?.find(
			(b) => b.id === originalBreakdownC!.id,
		);
		expect(updatedBreakdown?.granted_balance).toBe(50);
		expect(updatedBreakdown?.current_balance).toBe(50);
	});

	test("verify database state matches cache", async () => {
		// Wait for database sync
		await new Promise((resolve) => setTimeout(resolve, 2000));

		const customerFromDb = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{ skip_cache: "true" },
		);

		expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 330,
			current_balance: 330,
			usage: 0,
		});
	});
});
