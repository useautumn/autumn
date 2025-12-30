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
 * Test: Update balance with customer_entitlement_id filter
 *
 * Scenario:
 * - Product A: 100 messages (monthly)
 * - Product B: 50 messages (monthly)
 * - Product C: 200 messages (lifetime)
 *
 * Tests:
 * 1. Get breakdown IDs
 * 2. Update specific breakdown by customer_entitlement_id
 * 3. Verify only that breakdown was affected
 */

const messagesItemA = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
	interval: ProductItemInterval.Month,
});

const messagesItemB = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 50,
	interval: ProductItemInterval.Month,
});

const messagesItemC = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 200,
	interval: null,
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

const testCase = "update-current-balance-breakdown3";

describe(`${chalk.yellowBright("update-current-balance-breakdown3: filter by customer_entitlement_id")}`, () => {
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

	test("initial: customer has 350 with 3 breakdown items", async () => {
		expect(breakdownIds).toHaveLength(3);

		const balances = breakdownIds
			.map((b) => b.grantedBalance)
			.sort((a, b) => a - b);
		expect(balances).toEqual([50, 100, 200]);
	});

	test("update specific breakdown (100 → 75) by customer_entitlement_id", async () => {
		// Find the breakdown with 100 granted_balance
		const targetBreakdown = breakdownIds.find((b) => b.grantedBalance === 100);
		expect(targetBreakdown).toBeDefined();

		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 75,
			customer_entitlement_id: targetBreakdown!.id,
		});

		const res = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		// Total should be 325 (75 + 50 + 200)
		expect(res.balance).toMatchObject({
			granted_balance: 325,
			current_balance: 325,
			usage: 0,
		});

		// Verify the specific breakdown was updated
		const updatedBreakdown = res.balance?.breakdown?.find(
			(b) => b.id === targetBreakdown!.id,
		);
		expect(updatedBreakdown?.granted_balance).toBe(75);
		expect(updatedBreakdown?.current_balance).toBe(75);

		// Verify other breakdowns unchanged
		const otherBreakdowns =
			res.balance?.breakdown?.filter((b) => b.id !== targetBreakdown!.id) ?? [];
		const otherBalances = otherBreakdowns
			.map((b) => b.granted_balance)
			.sort((a, b) => (a ?? 0) - (b ?? 0));
		expect(otherBalances).toEqual([50, 200]);

		// Verify DB sync
		const customerFromDb = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{ skip_cache: "true" },
		);
		expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 325,
			current_balance: 325,
		});
	});

	test("update lifetime breakdown (200 → 150) by customer_entitlement_id", async () => {
		// Find the breakdown with 200 granted_balance (lifetime)
		const targetBreakdown = breakdownIds.find((b) => b.grantedBalance === 200);
		expect(targetBreakdown).toBeDefined();

		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 150,
			customer_entitlement_id: targetBreakdown!.id,
		});

		const res = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		// Total should be 275 (75 + 50 + 150)
		expect(res.balance).toMatchObject({
			granted_balance: 275,
			current_balance: 275,
			usage: 0,
		});

		// Verify the specific breakdown was updated
		const updatedBreakdown = res.balance?.breakdown?.find(
			(b) => b.id === targetBreakdown!.id,
		);
		expect(updatedBreakdown?.granted_balance).toBe(150);
		expect(updatedBreakdown?.current_balance).toBe(150);

		// Verify DB sync
		const customerFromDb = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{ skip_cache: "true" },
		);
		expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 275,
			current_balance: 275,
		});
	});
});
