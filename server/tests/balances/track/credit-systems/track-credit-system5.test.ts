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
	includedUsage: 100,
}) as LimitedItem;

const creditsFeature = constructFeatureItem({
	featureId: TestFeature.Credits,
	includedUsage: 200,
}) as LimitedItem;

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [action1Feature, creditsFeature],
});

const testCase = "track-credit-system5";

describe(`${chalk.yellowBright("track-credit-system5: test deduction order - action1 first, then credits (skipping cache)")}`, () => {
	const customerId = "track-credit-system5";
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });
	const creditFeature = ctx.features.find((f) => f.id === TestFeature.Credits);

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

	test("should have initial balances", async () => {
		const customer = await autumnV1.customers.get(customerId);

		expect(customer.features[TestFeature.Action1].balance).toBe(100);
		expect(customer.features[TestFeature.Credits].balance).toBe(200);
	});

	test("should deduct from action1 first (not credits)", async () => {
		const deductValue = 40.5;

		const trackRes: TrackResponseV2 = await autumnV2.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Action1,
				value: deductValue,
			},
			{
				skipCache: true,
			},
		);

		expect(trackRes.balance).toMatchObject({
			feature_id: TestFeature.Action1,
			current_balance: 100 - deductValue,
			usage: deductValue,
		});

		await timeout(2000);
		const customer = await autumnV1.customers.get(customerId, {
			skip_cache: "true",
		});

		// Action1 should be deducted
		expect(customer.features[TestFeature.Action1].balance).toBe(
			100 - deductValue,
		);
		expect(customer.features[TestFeature.Action1].usage).toBe(deductValue);

		// Credits should be untouched
		expect(customer.features[TestFeature.Credits].balance).toBe(200);
		expect(customer.features[TestFeature.Credits].usage).toBe(0);
	});

	test("should finish action1 balance and dip into credits", async () => {
		// Current: action1 = 59.5, credits = 200
		// Deduct 80 -> should take 59.5 from action1, then 20.5 from credits (with credit_cost)
		const deductValue = 80;
		const remainingAction1 = 59.5;
		const overflowAmount = deductValue - remainingAction1;

		const creditCostForOverflow = getCreditCost({
			featureId: TestFeature.Action1,
			creditSystem: creditFeature!,
			amount: overflowAmount,
		});

		const trackRes: TrackResponseV2 = await autumnV2.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Action1,
				value: deductValue,
			},
			{
				skipCache: true,
			},
		);

		expect(trackRes.balance).toMatchObject({
			feature_id: TestFeature.Credits,
			current_balance: 200 - creditCostForOverflow,
			usage: creditCostForOverflow,
		});

		await timeout(2000);
		const customer = await autumnV1.customers.get(customerId, {
			skip_cache: "true",
		});

		// Action1 should be fully depleted
		expect(customer.features[TestFeature.Action1].balance).toBe(0);
		expect(customer.features[TestFeature.Action1].usage).toBe(100);

		// Credits should be deducted by credit_cost * overflow
		expect(customer.features[TestFeature.Credits].balance).toBe(
			200 - creditCostForOverflow,
		);
		expect(customer.features[TestFeature.Credits].usage).toBe(
			creditCostForOverflow,
		);
	});

	test("should deduct only from credits now that action1 is depleted", async () => {
		const customerBefore = await autumnV1.customers.get(customerId);
		const creditsBefore = customerBefore.features[TestFeature.Credits].balance;

		const deductValue = 50.75;
		const creditCost = getCreditCost({
			featureId: TestFeature.Action1,
			creditSystem: creditFeature!,
			amount: deductValue,
		});

		const trackRes: TrackResponseV2 = await autumnV2.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Action1,
				value: deductValue,
			},
			{
				skipCache: true,
			},
		);

		expect(trackRes.balance).toMatchObject({
			feature_id: TestFeature.Credits,
			current_balance: new Decimal(creditsBefore!).minus(creditCost).toNumber(),
		});

		await timeout(2000);
		const customer = await autumnV1.customers.get(customerId, {
			skip_cache: "true",
		});

		// Action1 should still be 0
		expect(customer.features[TestFeature.Action1].balance).toBe(0);

		// Credits should be deducted
		expect(customer.features[TestFeature.Credits].balance).toBe(
			new Decimal(creditsBefore!).minus(creditCost).toNumber(),
		);
	});
});
