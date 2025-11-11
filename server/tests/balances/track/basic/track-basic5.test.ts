import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { timeout } from "tests/utils/genUtils.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const action1Feature = constructFeatureItem({
	featureId: TestFeature.Action1,
	includedUsage: 100,
});

const action2Feature = constructFeatureItem({
	featureId: TestFeature.Action2,
	includedUsage: 150,
});

const action3Feature = constructFeatureItem({
	featureId: TestFeature.Action3,
	includedUsage: 200,
});

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [action1Feature, action2Feature, action3Feature],
});

const testCase = "track-basic5";

describe(`${chalk.yellowBright("track-basic5: track specific feature_id only affects that feature")}`, () => {
	const customerId = "track-basic5";
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

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

		expect(customer.features[TestFeature.Action1].balance).toBe(100);
		expect(customer.features[TestFeature.Action2].balance).toBe(150);
		expect(customer.features[TestFeature.Action3].balance).toBe(200);
	});

	test("should only deduct from action1 when tracking feature_id: action1", async () => {
		const deductValue = 37.82;

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: deductValue,
		});

		const customer = await autumnV1.customers.get(customerId);

		// action1 should be deducted
		const expectedAction1Balance = new Decimal(100).sub(deductValue).toNumber();
		expect(customer.features[TestFeature.Action1].balance).toBe(
			expectedAction1Balance,
		);
		expect(customer.features[TestFeature.Action1].usage).toBe(deductValue);

		// action2 and action3 should remain unchanged
		expect(customer.features[TestFeature.Action2].balance).toBe(150);
		expect(customer.features[TestFeature.Action2].usage).toBe(0);
		expect(customer.features[TestFeature.Action3].balance).toBe(200);
		expect(customer.features[TestFeature.Action3].usage).toBe(0);
	});

	test("should reflect deduction in non-cached customer after 2s", async () => {
		const deductValue = 37.82;

		// Wait 2 seconds for DB sync
		await timeout(2000);

		// Fetch customer with skip_cache=true
		const customer = await autumnV1.customers.get(customerId, {
			skip_cache: "true",
		});

		// action1 should be deducted
		const expectedAction1Balance = new Decimal(100).sub(deductValue).toNumber();
		expect(customer.features[TestFeature.Action1].balance).toBe(
			expectedAction1Balance,
		);
		expect(customer.features[TestFeature.Action1].usage).toBe(deductValue);

		// action2 and action3 should remain unchanged
		expect(customer.features[TestFeature.Action2].balance).toBe(150);
		expect(customer.features[TestFeature.Action2].usage).toBe(0);
		expect(customer.features[TestFeature.Action3].balance).toBe(200);
		expect(customer.features[TestFeature.Action3].usage).toBe(0);
	});
});
