import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCustomer,
	ApiVersion,
	type CheckResponseV2,
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
import { timeout } from "../../../../utils/genUtils.js";

/**
 * Test: update-current-balance6
 *
 * Tests sync delta calculation with multiple breakdowns (different usage models):
 * - Product A (Free): 10 messages included (granted_balance)
 * - Product B (Prepaid): 0 included, purchase 20 credits (purchased_balance)
 * - Product C (Arrear): 15 messages included, pay-per-use overage
 *
 * Test flow:
 * 1. Attach all 3 products (total: 45 messages)
 * 2. Track usage to create various states (overage, partial usage)
 * 3. Update balance and verify sync delta calculation
 * 4. Verify each breakdown is correctly adjusted
 *
 * Note: Prepaid quantity goes to purchased_balance, not granted_balance.
 * With billingUnits: 1, quantity: 20 gives exactly 20 credits.
 */

// Free item - 10 messages included (goes to granted_balance)
const freeMessages = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 10,
});

// Prepaid item - 0 included, will purchase 20 credits
// Using billingUnits: 1 to get exact quantity (no rounding)
const prepaidMessages = constructPrepaidItem({
	featureId: TestFeature.Messages,
	includedUsage: 0, // No free credits
	price: 1,
	billingUnits: 1, // 1 credit per unit = exact quantity
});

// Arrear (pay-per-use) item - 15 messages included, overage allowed
const arrearMessages = constructArrearItem({
	featureId: TestFeature.Messages,
	includedUsage: 15,
	price: 0.1,
	billingUnits: 1,
});

const productA = constructProduct({
	id: "free-messages",
	type: "free",
	isDefault: false,
	items: [freeMessages],
});

const productB = constructProduct({
	id: "prepaid-messages",
	type: "free",
	isDefault: false,
	isAddOn: true,
	items: [prepaidMessages],
});

const productC = constructProduct({
	id: "arrear-messages",
	type: "free",
	isAddOn: true,
	isDefault: false,
	items: [arrearMessages],
});

const testCase = "update-current-balance6";

describe(`${chalk.yellowBright("update-current-balance6: sync delta with free/prepaid/arrear breakdowns")}`, () => {
	const customerId = testCase;
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [productA, productB, productC],
			prefix: testCase,
		});

		// Attach free product (Product A)
		await autumnV2.attach({
			customer_id: customerId,
			product_id: productA.id,
		});

		// Attach prepaid product (Product B) with quantity option
		// With billingUnits: 1, quantity: 20 gives exactly 20 credits
		// These go to purchased_balance, not granted_balance
		await autumnV2.attach({
			customer_id: customerId,
			product_id: productB.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 20,
				},
			],
		});

		// Attach arrear product (Product C)
		await autumnV2.attach({
			customer_id: customerId,
			product_id: productC.id,
		});

		await timeout(3000); // let stripe webhooks catch up
	});

	test("initial state: should have 45 total messages (10 granted + 20 purchased + 15 granted)", async () => {
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);

		// Free: 10, Prepaid: 20, Arrear: 15
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 25,
			current_balance: 45,
			purchased_balance: 20,
			usage: 0,
		});

		// Check breakdown has 3 items
		const checkRes = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		expect(checkRes.balance?.breakdown).toHaveLength(3);
	});

	test("track 15: exceeds Product A (10), spills into Product B prepaid", async () => {
		// Free: 0, Prepaid: 15, Arrear: 15
		await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 15,
		});

		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);

		// Total: granted=25, usage=15, current=30, purchased=20
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 25,
			current_balance: 30,
			purchased_balance: 20,
			usage: 15,
		});
	});

	test("track 10: partial usage from prepaid (Product B)", async () => {
		// Track 10 more - should use from prepaid balance
		// New: Free: 0, Prepaid: 5, Arrear: 15
		await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});

		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);

		// Total: granted=25, usage=25, current=20, purchased=20
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 25,
			current_balance: 20,
			purchased_balance: 20,
			usage: 25,
		});
	});

	test("track 25: exhausts prepaid and arrear, creates overage on arrear", async () => {
		// Track 25 more - exhausts prepaid (15 remaining) and arrear (15)
		// Old: Free: 0, Prepaid: 5, Arrear: 15
		// New: Free: 0, Prepaid: 0, Arrear: -5
		await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 25,
		});

		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);

		// Total usage: 25 + 25 = 50
		// Total available was 45, so we're in overage
		expect(customer.balances[TestFeature.Messages].usage).toBe(50);
		expect(
			customer.balances[TestFeature.Messages].current_balance,
		).toBeLessThanOrEqual(5);
	});

	test("update balance to 20: should adjust granted_balance across breakdowns", async () => {
		const beforeCustomer =
			await autumnV2.customers.get<ApiCustomer>(customerId);
		const beforeBalance = beforeCustomer.balances[TestFeature.Messages];

		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 20,
		});

		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);

		// After update:
		// - current_balance should be 20
		// - usage should be unchanged
		// - granted_balance should adjust to make current=20
		expect(customer.balances[TestFeature.Messages].current_balance).toBe(20);
		expect(customer.balances[TestFeature.Messages].usage).toBe(
			beforeBalance.usage,
		);

		// Expect free breakdown to be 20, prepaid to be 0, arrear to be 0, purchased balance 5
		const freeBreakdown = customer.balances[
			TestFeature.Messages
		].breakdown?.find((b) => b.plan_id === productA.id);

		const prepaidBreakdown = customer.balances[
			TestFeature.Messages
		].breakdown?.find((b) => b.plan_id === productB.id);
		const arrearBreakdown = customer.balances[
			TestFeature.Messages
		].breakdown?.find((b) => b.plan_id === productC.id);

		expect(freeBreakdown).toMatchObject({
			current_balance: 20,
			granted_balance: 30,
			purchased_balance: 0,
			usage: 10,
		});

		expect(prepaidBreakdown).toMatchObject({
			current_balance: 0,
			granted_balance: 0,
			purchased_balance: 20,
		});

		expect(arrearBreakdown).toMatchObject({
			granted_balance: 20,
			purchased_balance: 0,
			current_balance: 0,
		});
	});

	test("verify breakdown state after update", async () => {
		const checkRes = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		// Verify each breakdown
		for (const breakdown of checkRes.balance?.breakdown ?? []) {
			// current_balance formula: granted + purchased - usage
			const expectedCurrent =
				(breakdown.granted_balance ?? 0) +
				(breakdown.purchased_balance ?? 0) -
				(breakdown.usage ?? 0);

			// current_balance should match the formula (floored at 0)
			expect(breakdown.current_balance).toBe(Math.max(0, expectedCurrent));
		}

		// Total current_balance across breakdowns should sum to 20
		const totalCurrent =
			checkRes.balance?.breakdown?.reduce(
				(sum, b) => sum + (b.current_balance ?? 0),
				0,
			) ?? 0;
		expect(totalCurrent).toBe(20);
	});

	test("verify database state matches cache", async () => {
		await timeout(2000);

		const customerFromCache =
			await autumnV2.customers.get<ApiCustomer>(customerId);
		const customerFromDb = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{ skip_cache: "true" },
		);

		expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject(
			customerFromCache.balances[TestFeature.Messages],
		);
	});

	test("update balance to -10 (negative): should create overage on arrear breakdown", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: -10,
		});

		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);

		// For arrear items:
		// - current_balance floors at 0
		// - purchased_balance absorbs the negative
		expect(customer.balances[TestFeature.Messages].current_balance).toBe(0);
		expect(
			customer.balances[TestFeature.Messages].purchased_balance,
		).toBeGreaterThan(0);
	});

	test("update balance back to positive (50): purchased_balance should reset", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 50,
		});

		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);

		console.log(
			"Balance after positive update:",
			customer.balances[TestFeature.Messages],
		);

		// When back to positive:
		// - current_balance should be 50
		// - purchased_balance should be 0 (no overage)
		expect(customer.balances[TestFeature.Messages].current_balance).toBe(50);
		expect(customer.balances[TestFeature.Messages].purchased_balance).toBe(20); // 20 from prepaid

		// Verify breakdowns
		const checkRes = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		// Total current_balance should be 50
		const totalCurrent =
			checkRes.balance?.breakdown?.reduce(
				(sum, b) => sum + (b.current_balance ?? 0),
				0,
			) ?? 0;
		expect(totalCurrent).toBe(50);
	});

	test("final verification: database matches cache", async () => {
		await timeout(2000);

		const customerFromCache =
			await autumnV2.customers.get<ApiCustomer>(customerId);
		const customerFromDb = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{ skip_cache: "true" },
		);

		expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject(
			customerFromCache.balances[TestFeature.Messages],
		);

		console.log(
			"Final balance from DB:",
			customerFromDb.balances[TestFeature.Messages],
		);
	});
});
