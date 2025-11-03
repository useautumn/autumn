import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type LimitedItem } from "@autumn/shared";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { TestFeature } from "tests/setup/v2Features.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
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

		await autumnV1.track({
			customer_id: customerId,
			event_name: "action-event",
			value: deductValue,
		});

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

		await autumnV1.track({
			customer_id: customerId,
			event_name: "action-event",
			value: deductValue,
		});

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

		await autumnV1.track({
			customer_id: customerId,
			event_name: "action-event",
			value: deductValue,
		});

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
});
