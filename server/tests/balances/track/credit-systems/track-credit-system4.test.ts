import { beforeAll, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	type LimitedItem,
	type TrackResponseV2,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { timeout } from "@tests/utils/genUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { getCreditCost } from "@/internal/features/creditSystemUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const action1Feature = constructFeatureItem({
	featureId: TestFeature.Action1,
	includedUsage: 80,
}) as LimitedItem;

const creditsFeature = constructFeatureItem({
	featureId: TestFeature.Credits,
	includedUsage: 150,
}) as LimitedItem;

const action3Feature = constructFeatureItem({
	featureId: TestFeature.Action3,
	includedUsage: 60,
}) as LimitedItem;

const credits2Feature = constructFeatureItem({
	featureId: TestFeature.Credits2,
	includedUsage: 100,
}) as LimitedItem;

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [action1Feature, creditsFeature, action3Feature, credits2Feature],
});

const testCase = "track-credit-system4";

describe(`${chalk.yellowBright("track-credit-system4: test deduction with two credit system pairs")}`, () => {
	const customerId = "track-credit-system4";
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });
	const creditFeature = ctx.features.find((f) => f.id === TestFeature.Credits);
	const credit2Feature = ctx.features.find(
		(f) => f.id === TestFeature.Credits2,
	);

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

		await autumnV1.attach({
			customer_id: customerId,
			product_id: freeProd.id,
		});
	});

	test("should have initial balances for all features", async () => {
		const customer = await autumnV1.customers.get(customerId);

		expect(customer.features[TestFeature.Action1].balance).toBe(80);
		expect(customer.features[TestFeature.Credits].balance).toBe(150);
		expect(customer.features[TestFeature.Action3].balance).toBe(60);
		expect(customer.features[TestFeature.Credits2].balance).toBe(100);
	});

	test("should deduct from both action1 and action3 using event_name", async () => {
		const deductValue = 25.5;

		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			event_name: "action-event",
			value: deductValue,
		});

		expect(trackRes.balances?.[TestFeature.Action1]).toBeDefined();
		expect(trackRes.balances?.[TestFeature.Action3]).toBeDefined();
		expect(trackRes.balances?.[TestFeature.Credits]).toBeUndefined();
		expect(trackRes.balances?.[TestFeature.Credits2]).toBeUndefined();

		const customer = await autumnV1.customers.get(customerId);

		// Both actions should be deducted
		expect(customer.features[TestFeature.Action1].balance).toBe(
			new Decimal(80).sub(deductValue).toNumber(),
		);
		expect(customer.features[TestFeature.Action1].usage).toBe(deductValue);
		expect(customer.features[TestFeature.Action3].balance).toBe(
			new Decimal(60).sub(deductValue).toNumber(),
		);
		expect(customer.features[TestFeature.Action3].usage).toBe(deductValue);

		// Credits untouched (actions had enough balance)
		expect(customer.features[TestFeature.Credits].balance).toBe(150);
		expect(customer.features[TestFeature.Credits2].balance).toBe(100);
	});

	test("should finish action1 and action3, then dip into both credit systems", async () => {
		// Get current state after previous test
		const customerBefore = await autumnV1.customers.get(customerId);
		const remainingAction1 =
			customerBefore.features[TestFeature.Action1].balance!;
		const remainingAction3 =
			customerBefore.features[TestFeature.Action3].balance!;
		const creditsBefore = customerBefore.features[TestFeature.Credits].balance!;
		const credits2Before =
			customerBefore.features[TestFeature.Credits2].balance!;

		// Deduct 70 -> should finish both actions, then use credits
		const deductValue = 70;
		const overflowAction1 = deductValue - remainingAction1;
		const overflowAction3 = deductValue - remainingAction3;

		const creditCostAction1 = getCreditCost({
			featureId: TestFeature.Action1,
			creditSystem: creditFeature!,
			amount: overflowAction1,
		});

		const creditCostAction3 = getCreditCost({
			featureId: TestFeature.Action3,
			creditSystem: credit2Feature!,
			amount: overflowAction3,
		});

		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			event_name: "action-event",
			value: deductValue,
		});

		expect(trackRes.balances?.[TestFeature.Action1]).toBeUndefined();
		expect(trackRes.balances?.[TestFeature.Action3]).toBeUndefined();
		expect(trackRes.balances?.[TestFeature.Credits]).toBeDefined();
		expect(trackRes.balances?.[TestFeature.Credits2]).toBeDefined();

		const customer = await autumnV1.customers.get(customerId);

		// Both actions should be fully depleted
		expect(customer.features[TestFeature.Action1].balance).toBe(0);
		expect(customer.features[TestFeature.Action1].usage).toBe(80);
		expect(customer.features[TestFeature.Action3].balance).toBe(0);
		expect(customer.features[TestFeature.Action3].usage).toBe(60);

		// Both credit systems should be deducted
		const expectedCredits = new Decimal(creditsBefore)
			.sub(creditCostAction1)
			.toNumber();
		expect(customer.features[TestFeature.Credits].balance).toBe(
			expectedCredits,
		);

		const expectedCredits2 = new Decimal(credits2Before)
			.sub(creditCostAction3)
			.toNumber();
		expect(customer.features[TestFeature.Credits2].balance).toBe(
			expectedCredits2,
		);
	});

	test("should deduct only from credit systems after actions depleted", async () => {
		const customerBefore = await autumnV1.customers.get(customerId);
		const creditsBefore = customerBefore.features[TestFeature.Credits].balance;
		const credits2Before =
			customerBefore.features[TestFeature.Credits2].balance;

		const deductValue = 40.25;

		const creditCostAction1 = getCreditCost({
			featureId: TestFeature.Action1,
			creditSystem: creditFeature!,
			amount: deductValue,
		});

		const creditCostAction3 = getCreditCost({
			featureId: TestFeature.Action3,
			creditSystem: credit2Feature!,
			amount: deductValue,
		});

		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			event_name: "action-event",
			value: deductValue,
		});

		expect(trackRes.balances?.[TestFeature.Action1]).toBeUndefined();
		expect(trackRes.balances?.[TestFeature.Action3]).toBeUndefined();
		expect(trackRes.balances?.[TestFeature.Credits]).toBeDefined();
		expect(trackRes.balances?.[TestFeature.Credits2]).toBeDefined();

		const customer = await autumnV1.customers.get(customerId);

		// Actions should still be 0
		expect(customer.features[TestFeature.Action1].balance).toBe(0);
		expect(customer.features[TestFeature.Action3].balance).toBe(0);

		// Credits has enough balance
		expect(customer.features[TestFeature.Credits].balance).toBe(
			new Decimal(creditsBefore!).sub(creditCostAction1).toNumber(),
		);

		// Credits2 doesn't have enough balance, so it caps at 0 (no usage_allowed)
		const expectedCredits2 = new Decimal(credits2Before!)
			.sub(creditCostAction3)
			.toNumber();
		expect(customer.features[TestFeature.Credits2].balance).toBe(
			Math.max(0, expectedCredits2),
		);
	});

	test("should reflect all deductions in non-cached customer after 2s", async () => {
		// Calculate expected final balances based on all previous deductions:
		// Test 1: Deduct 25.5 from both action1 and action3
		// Test 2: Deduct 70 from both (depletes them and uses credit systems)
		// Test 3: Deduct 40.25 from both (only credit systems)

		const deduct1 = 25.5;
		const deduct2 = 70;
		const deduct3 = 40.25;

		// Action1: 80 - 25.5 - 54.5 = 0
		const remainingAction1AfterDeduct1 = 80 - deduct1; // 54.5
		const overflowAction1 = deduct2 - remainingAction1AfterDeduct1; // 15.5

		// Action3: 60 - 25.5 - 34.5 = 0
		const remainingAction3AfterDeduct1 = 60 - deduct1; // 34.5
		const overflowAction3 = deduct2 - remainingAction3AfterDeduct1; // 35.5

		// Calculate credit costs
		const creditCostAction1Overflow = getCreditCost({
			featureId: TestFeature.Action1,
			creditSystem: creditFeature!,
			amount: overflowAction1,
		});

		const creditCostAction1Deduct3 = getCreditCost({
			featureId: TestFeature.Action1,
			creditSystem: creditFeature!,
			amount: deduct3,
		});

		const creditCostAction3Overflow = getCreditCost({
			featureId: TestFeature.Action3,
			creditSystem: credit2Feature!,
			amount: overflowAction3,
		});

		const creditCostAction3Deduct3 = getCreditCost({
			featureId: TestFeature.Action3,
			creditSystem: credit2Feature!,
			amount: deduct3,
		});

		// Expected final balances
		const expectedAction1Balance = 0;
		const expectedAction1Usage = 80;
		const expectedAction3Balance = 0;
		const expectedAction3Usage = 60;

		const expectedCreditsBalance = new Decimal(150)
			.sub(creditCostAction1Overflow)
			.sub(creditCostAction1Deduct3)
			.toNumber();

		// Credits2 might be capped at 0
		const expectedCredits2Balance = Math.max(
			0,
			new Decimal(100)
				.sub(creditCostAction3Overflow)
				.sub(creditCostAction3Deduct3)
				.toNumber(),
		);

		// Wait 2 seconds for DB sync
		await timeout(2000);

		// Fetch customer with skip_cache=true
		const customer = await autumnV1.customers.get(customerId, {
			skip_cache: "true",
		});

		expect(customer.features[TestFeature.Action1].balance).toBe(
			expectedAction1Balance,
		);
		expect(customer.features[TestFeature.Action1].usage).toBe(
			expectedAction1Usage,
		);
		expect(customer.features[TestFeature.Action3].balance).toBe(
			expectedAction3Balance,
		);
		expect(customer.features[TestFeature.Action3].usage).toBe(
			expectedAction3Usage,
		);
		expect(customer.features[TestFeature.Credits].balance).toBe(
			expectedCreditsBalance,
		);
		expect(customer.features[TestFeature.Credits2].balance).toBe(
			expectedCredits2Balance,
		);
	});
});
