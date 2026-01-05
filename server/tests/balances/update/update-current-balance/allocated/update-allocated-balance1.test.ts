import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCustomer,
	ApiVersion,
	ProductItemFeatureType,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { timeout } from "../../../../utils/genUtils.js";

/**
 * Test: update-allocated-balance1
 *
 * Tests updating current_balance on a free allocated (ContinuousUse) feature:
 * 1. Attach free allocated feature (users)
 * 2. Track value to make current_balance 0 and purchased_balance positive
 * 3. Update current_balance to positive (purchased_balance should reset to 0)
 * 4. Update current_balance to negative
 */

const usersItem = constructFeatureItem({
	featureId: TestFeature.Users,
	includedUsage: 5,
	featureType: ProductItemFeatureType.ContinuousUse,
});

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [usersItem],
});

const testCase = "update-allocated-balance1";

describe(`${chalk.yellowBright("update-allocated-balance1: update balance on free allocated feature with overage")}`, () => {
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

	test("initial state: should have balance of 5 users", async () => {
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);

		expect(customer.balances[TestFeature.Users]).toMatchObject({
			granted_balance: 5,
			current_balance: 5,
			purchased_balance: 0,
			usage: 0,
		});
	});

	test("track +8 to make current_balance 0 and purchased_balance 3", async () => {
		// Track 8 users when we only have 5 allocated
		// This should result in: granted=5, usage=8, current=0, purchased=3
		const trackRes = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 8,
		});

		expect(trackRes.balance).toMatchObject({
			granted_balance: 5,
			current_balance: 0,
			purchased_balance: 3,
			usage: 8,
		});

		// Verify via customers.get
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customer.balances[TestFeature.Users]).toMatchObject({
			granted_balance: 5,
			current_balance: 0,
			purchased_balance: 3,
			usage: 8,
		});
	});

	test("update current_balance to 2 (positive): purchased_balance should reset to 0", async () => {
		// When we set current_balance to 2 (positive):
		// - granted_balance is adjusted to achieve the target current_balance
		// - purchased_balance should reset to 0 since we're no longer in overage
		// - usage remains unchanged
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			current_balance: 2,
		});

		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);

		// current_balance = granted_balance + purchased_balance - usage
		// 2 = granted_balance + 0 - 8
		// granted_balance = 10
		expect(customer.balances[TestFeature.Users]).toMatchObject({
			granted_balance: 10,
			current_balance: 2,
			purchased_balance: 0,
			usage: 8,
		});
	});

	test("update current_balance to -5 (negative): should create overage", async () => {
		// When we set current_balance to -5 (negative) on an allocated feature:
		// - For allocated features, current_balance floors at 0
		// - purchased_balance absorbs the negative to bring current_balance to 0
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			current_balance: -5,
		});

		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);

		// For allocated features with overage:
		// granted_balance is set to achieve target, purchased_balance absorbs negative
		// current_balance = granted_balance + purchased_balance - usage
		// 0 = granted_balance + purchased_balance - 8
		// If we want current=-5, granted is set to 3, purchased=5
		// actual_current = 3 + 5 - 8 = 0 (floored)
		expect(customer.balances[TestFeature.Users]).toMatchObject({
			granted_balance: 3,
			current_balance: 0,
			purchased_balance: 5,
			usage: 8,
		});
	});

	test("verify database state matches cache", async () => {
		await timeout(2000);

		const customerFromDb = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{
				skip_cache: "true",
			},
		);

		expect(customerFromDb.balances[TestFeature.Users]).toMatchObject({
			granted_balance: 3,
			current_balance: 0,
			purchased_balance: 5,
			usage: 8,
		});
	});
});
