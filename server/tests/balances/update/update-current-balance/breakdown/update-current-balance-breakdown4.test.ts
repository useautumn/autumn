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
import { timeout } from "../../../../utils/genUtils";

/**
 * Test: Update balance after track that spans multiple breakdowns
 *
 * Scenario:
 * - Product A: 100 messages (monthly)
 * - Product B: 50 messages (monthly)
 * - Product C: 200 messages (lifetime)
 * - Total: 350 messages
 *
 * Tests:
 * 1. Track 120 → depletes monthly breakdowns (100 + 50), leaves lifetime at 200
 * 2. Update current_balance to 150 → see how it distributes across breakdowns
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

const testCase = "update-current-balance-breakdown4";

describe(`${chalk.yellowBright("update-current-balance-breakdown4: update after track spans breakdowns")}`, () => {
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

		await autumnV2.attach({ customer_id: customerId, product_id: productA.id });
		await autumnV2.attach({ customer_id: customerId, product_id: productB.id });
		await autumnV2.attach({ customer_id: customerId, product_id: productC.id });
	});

	test("track 120: depletes across multiple breakdowns", async () => {
		const trackRes = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 120,
		});

		expect(trackRes.balance).toMatchObject({
			granted_balance: 350,
			current_balance: 230,
			usage: 120,
		});

		// Check breakdown state - monthly ones should be depleted
		const res = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		const breakdownSum =
			res.balance?.breakdown?.reduce(
				(sum, b) => sum + (b.current_balance ?? 0),
				0,
			) ?? 0;
		expect(breakdownSum).toBe(230);

		const usageSum =
			res.balance?.breakdown?.reduce((sum, b) => sum + (b.usage ?? 0), 0) ?? 0;
		expect(usageSum).toBe(120);
	});

	test("update current_balance to 150 after tracking", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 150,
		});

		const customerV2 = await autumnV2.customers.get<ApiCustomer>(customerId);
		const balance = customerV2.balances[TestFeature.Messages];

		// Total should be 150, usage should still be 120
		// granted_balance = current_balance + usage = 150 + 120 = 270
		expect(balance).toMatchObject({
			granted_balance: 270,
			current_balance: 150,
			usage: 120,
			purchased_balance: 0,
		});

		// Check breakdown state
		const res = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		// Sum of breakdown current_balances should equal total
		const breakdownSum =
			res.balance?.breakdown?.reduce(
				(sum, b) => sum + (b.current_balance ?? 0),
				0,
			) ?? 0;
		expect(breakdownSum).toBe(150);

		// Sum of breakdown usages should equal total usage
		const usageSum =
			res.balance?.breakdown?.reduce((sum, b) => sum + (b.usage ?? 0), 0) ?? 0;
		expect(usageSum).toBe(120);

		// Verify DB sync
		await timeout(2000);
		const customerFromDb = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{ skip_cache: "true" },
		);

		expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 270,
			current_balance: 150,
			usage: 120,
		});
	});

	test("update current_balance to 300 (increase after tracking)", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 300,
		});

		const customerV2 = await autumnV2.customers.get<ApiCustomer>(customerId);
		const balance = customerV2.balances[TestFeature.Messages];

		// granted_balance = current_balance + usage = 300 + 120 = 420
		expect(balance).toMatchObject({
			granted_balance: 420,
			current_balance: 300,
			usage: 120,
			purchased_balance: 0,
		});

		// Verify DB sync
		const customerFromDb = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{ skip_cache: "true" },
		);
		expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 420,
			current_balance: 300,
			usage: 120,
		});
	});
});
