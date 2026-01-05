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
 * Test: Update balance after tracking usage
 *
 * Scenario:
 * 1. Start with 100 messages
 * 2. Track 30 usage → balance: 70, usage: 30
 * 3. Update current_balance to 50 → granted_balance adjusts to 80, usage stays 30
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

const testCase = "update-current-balance2";

describe(`${chalk.yellowBright("update-current-balance2: update balance after track")}`, () => {
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

	test("track 30 usage", async () => {
		const trackRes = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 30,
		});

		expect(trackRes.balance).toMatchObject({
			granted_balance: 100,
			current_balance: 70,
			usage: 30,
			purchased_balance: 0,
		});
	});

	test("update current_balance to 50 after tracking", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 50,
		});

		const customerV2 = await autumnV2.customers.get<ApiCustomer>(customerId);
		const balance = customerV2.balances[TestFeature.Messages];

		// granted_balance should adjust to 80 (50 + 30 usage)
		expect(balance).toMatchObject({
			granted_balance: 80,
			current_balance: 50,
			usage: 30,
			purchased_balance: 0,
		});

		// Verify DB sync
		const customerFromDb = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{ skip_cache: "true" },
		);
		const balanceFromDb = customerFromDb.balances[TestFeature.Messages];

		expect(balanceFromDb).toMatchObject({
			granted_balance: 80,
			current_balance: 50,
			usage: 30,
			purchased_balance: 0,
		});
	});

	test("update current_balance to 120 (above original granted)", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 120,
		});

		const customerV2 = await autumnV2.customers.get<ApiCustomer>(customerId);
		const balance = customerV2.balances[TestFeature.Messages];

		// granted_balance should adjust to 150 (120 + 30 usage)
		expect(balance).toMatchObject({
			granted_balance: 150,
			current_balance: 120,
			usage: 30,
			purchased_balance: 0,
		});

		// Verify DB sync
		const customerFromDb = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{ skip_cache: "true" },
		);
		const balanceFromDb = customerFromDb.balances[TestFeature.Messages];

		expect(balanceFromDb).toMatchObject({
			granted_balance: 150,
			current_balance: 120,
			usage: 30,
			purchased_balance: 0,
		});
	});
});

