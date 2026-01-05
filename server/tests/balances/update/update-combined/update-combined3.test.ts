import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCustomer,
	ApiVersion,
	type CheckResponseV2,
	type LimitedItem,
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
 * Test: Update current_balance + granted_balance + next_reset_at all together
 *
 * Scenario:
 * 1. Start with 100 messages (monthly)
 * 2. Track 30 usage
 * 3. Update all three: current_balance, granted_balance, and next_reset_at
 * 4. Verify all values are updated correctly
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

const testCase = "update-combined3";

describe(`${chalk.yellowBright("update-combined3: current_balance + granted_balance + next_reset_at")}`, () => {
	const customerId = testCase;
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

	let cusEntId: string;

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

		// Get customer_entitlement_id
		const res = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		cusEntId = res.balance?.breakdown?.[0]?.id ?? "";
	});

	test("track 30 usage first", async () => {
		await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 30,
		});

		const customerV2 = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customerV2.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 100,
			current_balance: 70,
			usage: 30,
		});
	});

	test("update all three values at once", async () => {
		const newResetAt = Date.now() + 14 * 24 * 60 * 60 * 1000; // 14 days

		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 80,
			granted_balance: 150,
			next_reset_at: newResetAt,
			customer_entitlement_id: cusEntId,
		});

		const customerV2 = await autumnV2.customers.get<ApiCustomer>(customerId);
		const balance = customerV2.balances[TestFeature.Messages];

		// granted_balance: 150, current_balance: 80, usage: 70
		expect(balance).toMatchObject({
			granted_balance: 150,
			current_balance: 80,
			usage: 70,
			purchased_balance: 0,
		});

		// Verify reset time
		const res = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(res.balance?.reset?.resets_at).toBeCloseTo(newResetAt, -3);

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

	test("update all values to reset state", async () => {
		const newResetAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days

		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 200,
			granted_balance: 200,
			next_reset_at: newResetAt,
			customer_entitlement_id: cusEntId,
		});

		const customerV2 = await autumnV2.customers.get<ApiCustomer>(customerId);
		const balance = customerV2.balances[TestFeature.Messages];

		// Reset: granted = current = 200, usage = 0
		expect(balance).toMatchObject({
			granted_balance: 200,
			current_balance: 200,
			usage: 0,
			purchased_balance: 0,
		});

		// Verify reset time
		const res = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(res.balance?.reset?.resets_at).toBeCloseTo(newResetAt, -3);

		// Verify DB sync
		const customerFromDb = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{ skip_cache: "true" },
		);
		expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 200,
			current_balance: 200,
			usage: 0,
		});
	});
});

