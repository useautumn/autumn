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
 * Test: Update current_balance + next_reset_at together
 *
 * Scenario:
 * 1. Start with 100 messages (monthly)
 * 2. Update current_balance and next_reset_at simultaneously
 * 3. Verify both values are updated correctly
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

const testCase = "update-combined2";

describe(`${chalk.yellowBright("update-combined2: current_balance + next_reset_at together")}`, () => {
	const customerId = testCase;
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

	let originalResetAt: number;
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

		// Get original reset time and customer_entitlement_id
		const res = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		originalResetAt = res.balance?.reset?.resets_at ?? 0;
		cusEntId = res.balance?.breakdown?.[0]?.id ?? "";
	});

	test("initial state: has reset time", async () => {
		expect(originalResetAt).toBeGreaterThan(Date.now());
		expect(cusEntId).toBeTruthy();
	});

	test("update current_balance and next_reset_at together", async () => {
		// Set next reset to 1 week from now
		const newResetAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 50,
			next_reset_at: newResetAt,
			customer_entitlement_id: cusEntId,
		});

		const customerV2 = await autumnV2.customers.get<ApiCustomer>(customerId);
		const balance = customerV2.balances[TestFeature.Messages];

		expect(balance).toMatchObject({
			granted_balance: 50,
			current_balance: 50,
			usage: 0,
		});

		// Verify reset time was updated
		const res = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		// Reset time should be close to what we set (within 1 second tolerance)
		expect(res.balance?.reset?.resets_at).toBeCloseTo(newResetAt, -3);

		// Verify DB sync
		const customerFromDb = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{ skip_cache: "true" },
		);
		expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 50,
			current_balance: 50,
		});
	});

	test("update current_balance and push next_reset_at to 30 days", async () => {
		// Set next reset to 30 days from now
		const newResetAt = Date.now() + 30 * 24 * 60 * 60 * 1000;

		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 200,
			next_reset_at: newResetAt,
			customer_entitlement_id: cusEntId,
		});

		const customerV2 = await autumnV2.customers.get<ApiCustomer>(customerId);
		const balance = customerV2.balances[TestFeature.Messages];

		expect(balance).toMatchObject({
			granted_balance: 200,
			current_balance: 200,
			usage: 0,
		});

		// Verify reset time
		const res = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		expect(res.balance?.reset?.resets_at).toBeCloseTo(newResetAt, -3);
	});
});

