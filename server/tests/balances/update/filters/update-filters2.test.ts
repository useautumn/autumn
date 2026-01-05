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
import {
	constructArrearItem,
	constructFeatureItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

/**
 * Test: update-filters2
 *
 * Tests filtering balance updates by customer_entitlement_id with different item types.
 *
 * Scenario:
 * - Product A: Free monthly (100 messages → granted_balance)
 * - Product B: Prepaid monthly (quantity 100 with billingUnits 100 → purchased_balance 100)
 *   NOTE: Prepaid quantity is rounded to nearest billing unit!
 * - Product C: Pay-per-use monthly (200 messages included → granted_balance)
 * - All monthly intervals
 * - Update each breakdown individually by customer_entitlement_id
 *
 * Expected totals:
 * - granted_balance: 100 (free) + 0 (prepaid includedUsage) + 200 (arrear) = 300
 * - purchased_balance: 100 (prepaid quantity, rounded to billing units)
 * - current_balance: 300 + 100 = 400
 */

const freeMessagesItem = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
	interval: ProductItemInterval.Month,
});

const prepaidMessagesItem = constructPrepaidItem({
	featureId: TestFeature.Messages,
	includedUsage: 0,
	price: 9,
	billingUnits: 100,
});

const arrearMessagesItem = constructArrearItem({
	featureId: TestFeature.Messages,
	includedUsage: 200,
	price: 0.1,
	billingUnits: 1000,
});

const freeProd = constructProduct({
	type: "free",
	id: "free-prod",
	isDefault: false,
	items: [freeMessagesItem],
});

const prepaidProd = constructProduct({
	type: "free",
	id: "prepaid-prod",
	isDefault: false,
	isAddOn: true,
	items: [prepaidMessagesItem],
});

const arrearProd = constructProduct({
	type: "free",
	id: "arrear-prod",
	isDefault: false,
	isAddOn: true,
	items: [arrearMessagesItem],
});

const testCase = "update-filters2";

describe(`${chalk.yellowBright("update-filters2: filter by cusEntId with free + prepaid + pay-per-use")}`, () => {
	const customerId = testCase;
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

	let breakdowns: {
		id: string;
		grantedBalance: number;
		currentBalance: number;
		overageAllowed: boolean;
		planId: string;
	}[] = [];

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [freeProd, prepaidProd, arrearProd],
			prefix: testCase,
		});

		await autumnV2.attach({ customer_id: customerId, product_id: freeProd.id });
		await autumnV2.attach({
			customer_id: customerId,
			product_id: prepaidProd.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 100,
				},
			],
		});
		await autumnV2.attach({
			customer_id: customerId,
			product_id: arrearProd.id,
		});

		// Get breakdown IDs
		const res = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		breakdowns =
			res.balance?.breakdown?.map((b) => ({
				id: b.id!,
				planId: b.plan_id!,
				grantedBalance: b.granted_balance!,
				currentBalance: b.current_balance!,
				overageAllowed: b.overage_allowed!,
			})) ?? [];
	});

	test("initial: customer has 400 current_balance with 3 breakdown items of different types", async () => {
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 300,
			current_balance: 400,
			purchased_balance: 100,
			usage: 0,
		});

		expect(breakdowns).toHaveLength(3);

		const balances = breakdowns
			.map((b) => b.currentBalance)
			.sort((a, b) => a - b);
		expect(balances).toEqual([100, 100, 200]);

		// Verify we have different overage_allowed states
		const overageStates = breakdowns.map((b) => b.overageAllowed);
		// Only the arrear item should have overage_allowed=true
		expect(overageStates.filter((o) => o === true).length).toBe(1);
	});

	test("update free breakdown (100 → 75) by customer_entitlement_id", async () => {
		// Free item: 100 messages, no overage
		const freeBreakdown = breakdowns.find(
			(b) => b.grantedBalance === 100 && !b.overageAllowed,
		);
		expect(freeBreakdown).toBeDefined();

		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 75,
			customer_entitlement_id: freeBreakdown!.id,
		});

		const res = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		// Total should be 325 (75 + 50 + 200)
		expect(res.balance).toMatchObject({
			granted_balance: 275,
			current_balance: 375,
			purchased_balance: 100,
			usage: 0,
		});

		// Verify the specific breakdown was updated
		const updatedBreakdown = res.balance?.breakdown?.find(
			(b) => b.id === freeBreakdown!.id,
		);
		expect(updatedBreakdown?.granted_balance).toBe(75);
		expect(updatedBreakdown?.current_balance).toBe(75);

		// Update local cache
		breakdowns = breakdowns.map((b) =>
			b.id === freeBreakdown!.id
				? { ...b, grantedBalance: 75, currentBalance: 75 }
				: b,
		);
	});

	test("update prepaid breakdown by customer_entitlement_id", async () => {
		// Find the prepaid breakdown - it's the one that's not free and not arrear
		// Can't rely on granted_balance since prepaid purchased goes to purchased_balance
		const prepaidBreakdown = breakdowns.find(
			(b) => b.planId === prepaidProd.id,
		);
		expect(prepaidBreakdown).toBeDefined();

		// Update prepaid breakdown's current_balance
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 150,
			customer_entitlement_id: prepaidBreakdown!.id,
		});

		const res = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		// Verify the specific breakdown was updated
		const updatedBreakdown = res.balance?.breakdown?.find(
			(b) => b.plan_id === prepaidProd.id,
		);

		expect(updatedBreakdown?.current_balance).toBe(150);
	});

	test("update arrear breakdown (→ 150) by customer_entitlement_id", async () => {
		// Arrear item: has overage_allowed=true
		const arrearBreakdown = breakdowns.find((b) => b.planId === arrearProd.id);
		expect(arrearBreakdown).toBeDefined();

		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 150,
			customer_entitlement_id: arrearBreakdown!.id,
		});

		const res = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		// Verify the specific breakdown was updated
		const updatedBreakdown = res.balance?.breakdown?.find(
			(b) => b.plan_id === arrearProd.id,
		);
		expect(updatedBreakdown?.current_balance).toBe(150);
		expect(updatedBreakdown?.overage_allowed).toBe(true);
	});

	test("update arrear breakdown to negative (-50) by customer_entitlement_id", async () => {
		// Arrear item allows negative balance
		const arrearBreakdown = breakdowns.find((b) => b.planId === arrearProd.id);
		expect(arrearBreakdown).toBeDefined();

		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: -50,
			customer_entitlement_id: arrearBreakdown!.id,
		});

		const res = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		// Verify the specific breakdown went negative
		const updatedBreakdown = res.balance?.breakdown?.find(
			(b) => b.plan_id === arrearProd.id,
		);
		expect(updatedBreakdown).toMatchObject({
			granted_balance: -50,
			current_balance: 0,
			purchased_balance: 50,
		});
	});

	test("verify database state matches cache", async () => {
		// Wait for database sync
		await new Promise((resolve) => setTimeout(resolve, 2000));

		const customerFromDb = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{ skip_cache: "true" },
		);
		const customerFromCache =
			await autumnV2.customers.get<ApiCustomer>(customerId);

		// Verify cache and DB match
		expect(customerFromDb.balances[TestFeature.Messages].current_balance).toBe(
			customerFromCache.balances[TestFeature.Messages].current_balance,
		);
	});
});
