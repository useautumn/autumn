import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, OnDecrease, OnIncrease } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

/**
 * Test to verify replaceable balance logic works correctly:
 *
 * Scenario:
 * - Product: 1 included usage, $50 per user
 * - Use 2 seats (1 paid)
 * - Track -1 to create replaceable
 * - Verify balance values match expected unused logic
 *
 * Expected behavior:
 * Before track -1:
 *   granted_balance: 1
 *   current_balance: 0
 *   purchased_balance: 1
 *   usage: 2
 *
 * After track -1 (creates 1 replaceable):
 *   granted_balance: 1
 *   current_balance: 1 (includes unused)
 *   purchased_balance: 1
 *   usage: 1 (reduced by unused)
 */
const userItem = constructArrearProratedItem({
	featureId: TestFeature.Users,
	pricePerUnit: 50,
	includedUsage: 1,
	config: {
		on_increase: OnIncrease.BillImmediately,
		on_decrease: OnDecrease.None,
	},
});

export const pro = constructProduct({
	items: [userItem],
	type: "pro",
});

const testCase = "track-paid-allocated1";

describe(`${chalk.yellowBright(`${testCase}: Replaceable model gives correct balance values`)}`, () => {
	const customerId = testCase;

	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [pro],
			prefix: testCase,
			customerId,
		});

		await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		await autumnV2.attach({
			customer_id: customerId,
			product_id: pro.id,
		});
	});

	test("should track 2 and have correct balance values", async () => {
		const trackRes = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 2,
		});

		const balance = trackRes.balance;

		expect(balance).toBeDefined();
		expect(trackRes.balance).toMatchObject({
			granted_balance: 1,
			purchased_balance: 1,
			current_balance: 0,
			usage: 2,
		});
	});

	test("should track -1 and balance should reflect unused (replaceable)", async () => {
		const trackRes = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: -1,
		});

		const balance = trackRes.balance;

		expect(balance).toBeDefined();
		expect(trackRes.balance).toMatchObject({
			granted_balance: 1,
			purchased_balance: 1,
			current_balance: 1,
			usage: 1,
		});
	});

	test("should track 1 and have correct balance values", async () => {
		const trackRes = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 1,
		});

		const balance = trackRes.balance;
		expect(balance).toBeDefined();
		expect(trackRes.balance).toMatchObject({
			granted_balance: 1,
			purchased_balance: 1,
			current_balance: 0,
			usage: 2,
		});
	});
});
