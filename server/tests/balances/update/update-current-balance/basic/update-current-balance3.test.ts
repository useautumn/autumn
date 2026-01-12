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
 * Test: Update balance to 0
 *
 * Scenario:
 * 1. Start with 100 messages
 * 2. Update current_balance to 0 → granted_balance should also be 0
 * 3. Then update back to 50
 */

const messagesFeature = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
}) as LimitedItem;

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [messagesFeature],
});

const testCase = "update-current-balance3";

describe(`${chalk.yellowBright("update-current-balance3: update balance to 0")}`, () => {
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

	test("update current_balance to 0", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 0,
		});

		const customerV2 = await autumnV2.customers.get<ApiCustomer>(customerId);
		const balance = customerV2.balances[TestFeature.Messages];

		expect(balance).toMatchObject({
			granted_balance: 0,
			current_balance: 0,
			usage: 0,
			purchased_balance: 0,
		});

		// Verify DB sync
		const customerFromDb = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{ skip_cache: "true" },
		);
		const balanceFromDb = customerFromDb.balances[TestFeature.Messages];

		expect(balanceFromDb).toMatchObject({
			granted_balance: 0,
			current_balance: 0,
			usage: 0,
			purchased_balance: 0,
		});
	});

	test("update current_balance from 0 to 50", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 50,
		});

		const customerV2 = await autumnV2.customers.get<ApiCustomer>(customerId);
		const balance = customerV2.balances[TestFeature.Messages];

		expect(balance).toMatchObject({
			granted_balance: 50,
			current_balance: 50,
			usage: 0,
			purchased_balance: 0,
		});

		// Verify DB sync
		const customerFromDb = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{ skip_cache: "true" },
		);
		const balanceFromDb = customerFromDb.balances[TestFeature.Messages];

		expect(balanceFromDb).toMatchObject({
			granted_balance: 50,
			current_balance: 50,
			usage: 0,
			purchased_balance: 0,
		});
	});

	test("track 20 then update to 0", async () => {
		await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 20,
		});

		// Balance should be 30 now (50 - 20)
		const beforeUpdate = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(beforeUpdate.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 50,
			current_balance: 30,
			usage: 20,
		});

		// Update to 0
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 0,
		});

		const customerV2 = await autumnV2.customers.get<ApiCustomer>(customerId);
		const balance = customerV2.balances[TestFeature.Messages];

		// granted_balance should be 20 (0 + 20 usage)
		expect(balance).toMatchObject({
			granted_balance: 20,
			current_balance: 0,
			usage: 20,
			purchased_balance: 0,
		});

		// Verify DB sync
		const customerFromDb = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{ skip_cache: "true" },
		);
		const balanceFromDb = customerFromDb.balances[TestFeature.Messages];

		expect(balanceFromDb).toMatchObject({
			granted_balance: 20,
			current_balance: 0,
			usage: 20,
			purchased_balance: 0,
		});
	});
});
