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
 * Test: Update current_balance + granted_balance together
 *
 * Scenario:
 * 1. Start with 100 messages
 * 2. Track 30 → current_balance: 70, usage: 30
 * 3. Update current_balance: 50, granted_balance: 100
 *    → Should set granted to 100, current to 50, usage recalculated to 50
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

const testCase = "update-combined1";

describe(`${chalk.yellowBright("update-combined1: current_balance + granted_balance together")}`, () => {
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

	test("track 30 usage first", async () => {
		const trackRes = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 30,
		});

		expect(trackRes.balance).toMatchObject({
			granted_balance: 100,
			current_balance: 70,
			usage: 30,
		});
	});

	test("update current_balance: 50 and granted_balance: 100", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 50,
			granted_balance: 100,
		});

		const customerV2 = await autumnV2.customers.get<ApiCustomer>(customerId);
		const balance = customerV2.balances[TestFeature.Messages];

		// granted_balance explicitly set to 100, current_balance to 50
		// usage = granted_balance - current_balance = 100 - 50 = 50
		expect(balance).toMatchObject({
			granted_balance: 100,
			current_balance: 50,
			usage: 50,
			purchased_balance: 0,
		});

		// Verify DB sync
		const customerFromDb = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{ skip_cache: "true" },
		);
		expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 100,
			current_balance: 50,
			usage: 50,
		});
	});

	test("update current_balance: 80 and granted_balance: 150", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 80,
			granted_balance: 150,
		});

		const customerV2 = await autumnV2.customers.get<ApiCustomer>(customerId);
		const balance = customerV2.balances[TestFeature.Messages];

		// usage = 150 - 80 = 70
		expect(balance).toMatchObject({
			granted_balance: 150,
			current_balance: 80,
			usage: 70,
			purchased_balance: 0,
		});

		// Verify DB sync
		const customerFromDb = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{ skip_cache: "true" },
		);
		expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 150,
			current_balance: 80,
			usage: 70,
		});
	});

	test("update to reset usage: current_balance: 100, granted_balance: 100", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 100,
			granted_balance: 100,
		});

		const customerV2 = await autumnV2.customers.get<ApiCustomer>(customerId);
		const balance = customerV2.balances[TestFeature.Messages];

		// usage = 100 - 100 = 0
		expect(balance).toMatchObject({
			granted_balance: 100,
			current_balance: 100,
			usage: 0,
			purchased_balance: 0,
		});

		// Verify DB sync
		const customerFromDb = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{ skip_cache: "true" },
		);
		expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 100,
			current_balance: 100,
			usage: 0,
		});
	});
});

