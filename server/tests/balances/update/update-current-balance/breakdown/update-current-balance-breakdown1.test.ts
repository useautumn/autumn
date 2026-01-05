import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCustomer,
	ApiVersion,
	type CheckResponseV2,
	ProductItemInterval,
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
 * Test: Update balance with multiple products (3 products, same feature)
 *
 * Scenario:
 * - Product A: 100 messages (monthly)
 * - Product B: 50 messages (monthly)
 * - Product C: 200 messages (lifetime)
 * - Total: 350 messages across 3 breakdown items
 *
 * Tests:
 * 1. Update without filter - should update all breakdowns proportionally? or first?
 * 2. Verify breakdown state after update
 */

const messagesItemA = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
	interval: ProductItemInterval.Month,
});

const messagesItemB = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 50,
	interval: ProductItemInterval.Month,
});

const messagesItemC = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 200,
	interval: null,
});

const productA = constructProduct({
	type: "free",
	id: "prod-a",
	isDefault: false,
	items: [messagesItemA],
});

const productB = constructProduct({
	type: "free",
	id: "prod-b",
	isDefault: false,
	isAddOn: true,
	items: [messagesItemB],
});

const productC = constructProduct({
	type: "free",
	id: "prod-c",
	isDefault: false,
	isAddOn: true,
	items: [messagesItemC],
});

const testCase = "update-current-balance-breakdown1";

describe(`${chalk.yellowBright("update-current-balance-breakdown1: 3 products same feature")}`, () => {
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
			products: [productA, productB, productC],
			prefix: testCase,
		});

		// Attach all three products
		await autumnV2.attach({ customer_id: customerId, product_id: productA.id });
		await autumnV2.attach({ customer_id: customerId, product_id: productB.id });
		await autumnV2.attach({ customer_id: customerId, product_id: productC.id });
	});

	test("initial: customer has 350 with 3 breakdown items", async () => {
		const res = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		expect(res.balance).toMatchObject({
			granted_balance: 350,
			current_balance: 350,
			usage: 0,
		});

		// Should have 3 breakdown items
		expect(res.balance?.breakdown).toHaveLength(3);

		// Verify each breakdown exists with correct values
		const breakdowns = res.balance?.breakdown ?? [];
		const balances = breakdowns
			.map((b) => b.granted_balance)
			.sort((a, b) => (a ?? 0) - (b ?? 0));
		expect(balances).toEqual([50, 100, 200]);
	});

	test("update current_balance to 300 (decrease by 50)", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 300,
		});

		const customerV2 = await autumnV2.customers.get<ApiCustomer>(customerId);
		const balance = customerV2.balances[TestFeature.Messages];

		// Total should be 300
		expect(balance).toMatchObject({
			granted_balance: 300,
			current_balance: 300,
			usage: 0,
			purchased_balance: 0,
		});

		// Check breakdown state
		const res = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		expect(res.balance?.breakdown).toHaveLength(3);

		// Sum of breakdown current_balances should equal total
		const breakdownSum =
			res.balance?.breakdown?.reduce(
				(sum, b) => sum + (b.current_balance ?? 0),
				0,
			) ?? 0;
		expect(breakdownSum).toBe(300);

		// Verify DB sync
		const customerFromDb = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{ skip_cache: "true" },
		);
		const balanceFromDb = customerFromDb.balances[TestFeature.Messages];

		expect(balanceFromDb).toMatchObject({
			granted_balance: 300,
			current_balance: 300,
			usage: 0,
		});
	});

	test("update current_balance to 400 (increase by 100)", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 400,
		});

		const customerV2 = await autumnV2.customers.get<ApiCustomer>(customerId);
		const balance = customerV2.balances[TestFeature.Messages];

		// Total should be 400
		expect(balance).toMatchObject({
			granted_balance: 400,
			current_balance: 400,
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
			granted_balance: 400,
			current_balance: 400,
			usage: 0,
		});
	});
});
