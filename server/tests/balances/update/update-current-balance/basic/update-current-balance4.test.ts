import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCustomer,
	ApiVersion,
	type LimitedItem,
	ResetInterval,
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
 * Test: Update balance on lifetime (one-off) interval feature
 *
 * Scenario:
 * 1. Attach product with lifetime messages (no reset)
 * 2. Update balance from 100 to 50
 * 3. Track 20, then update to 80
 */

const messagesFeature = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
	interval: null,
}) as LimitedItem;

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [messagesFeature],
});

const testCase = "update-current-balance4";

describe(`${chalk.yellowBright("update-current-balance4: update lifetime (one-off) balance")}`, () => {
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

	test("initial balance should be 100 with lifetime interval", async () => {
		const customerV2 = await autumnV2.customers.get<ApiCustomer>(customerId);
		const balance = customerV2.balances[TestFeature.Messages];

		expect(balance).toMatchObject({
			granted_balance: 100,
			current_balance: 100,
			usage: 0,
			purchased_balance: 0,
		});

		// Lifetime features have no reset
		expect(balance.reset?.interval).toBe(ResetInterval.OneOff);
	});

	test("update current_balance from 100 to 50", async () => {
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

	test("track 20 then update to 80", async () => {
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

		// Update to 80
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 80,
		});

		const customerV2 = await autumnV2.customers.get<ApiCustomer>(customerId);
		const balance = customerV2.balances[TestFeature.Messages];

		// granted_balance should be 100 (80 + 20 usage)
		expect(balance).toMatchObject({
			granted_balance: 100,
			current_balance: 80,
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
			granted_balance: 100,
			current_balance: 80,
			usage: 20,
			purchased_balance: 0,
		});
	});
});
