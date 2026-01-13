import { beforeAll, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	type CheckResponseV1,
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
 * Test: Monthly messages + Lifetime messages under the SAME product
 * Expected: breakdown array with 2 items (different reset intervals, same product)
 */

const monthlyMessages = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 500,
	interval: ProductItemInterval.Month,
});

const lifetimeMessages = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 200,
	interval: null, // lifetime
});

const combinedProd = constructProduct({
	type: "free",
	id: "combined-prod",
	isDefault: false,
	items: [monthlyMessages, lifetimeMessages],
});

const testCase = "check-breakdown6";

describe(`${chalk.yellowBright("check-breakdown6: monthly + lifetime messages in same product = 2 breakdown items")}`, () => {
	const customerId = testCase;
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		await initProductsV0({
			ctx,
			products: [combinedProd],
			prefix: testCase,
		});

		await autumnV2.attach({
			customer_id: customerId,
			product_id: combinedProd.id,
		});
	});

	test("v2: should have correct parent balance and 2 breakdown items", async () => {
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		// Parent balance should sum both items
		expect(res.balance).toMatchObject({
			granted_balance: 700, // 500 + 200
			current_balance: 700,
			usage: 0,
			plan_id: combinedProd.id, // Same product for both
		});

		// Should have 2 breakdown items with unique IDs
		const breakdown = res.balance?.breakdown;
		expect(breakdown).toHaveLength(2);
		expect(new Set(breakdown?.map((b) => b.id)).size).toBe(2);
	});

	test("v2: breakdown items should have correct values", async () => {
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		const monthlyBreakdown = res.balance?.breakdown?.find(
			(b) => b.granted_balance === 500,
		);
		const lifetimeBreakdown = res.balance?.breakdown?.find(
			(b) => b.granted_balance === 200,
		);

		expect(monthlyBreakdown).toMatchObject({
			granted_balance: 500,
			current_balance: 500,
			usage: 0,
			plan_id: combinedProd.id,
			reset: {
				interval: "month",
			},
		});

		expect(lifetimeBreakdown).toMatchObject({
			granted_balance: 200,
			current_balance: 200,
			usage: 0,
			plan_id: combinedProd.id,
			reset: {
				interval: "one_off",
				resets_at: null,
			},
		});
	});

	test("v1.2: should have correct parent and 2 breakdown items", async () => {
		const res = (await autumnV1.check<CheckResponseV1>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV1;

		// Parent balance should sum both items
		expect(res.included_usage).toBe(700); // 500 + 200
		expect(res.balance).toBe(700);
		expect(res.usage).toBe(0);

		// Should have 2 breakdown items
		expect(res.breakdown).toHaveLength(2);
	});

	test("v1.2: breakdown items should have correct values", async () => {
		const res = (await autumnV1.check<CheckResponseV1>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV1;

		const monthlyBreakdown = res.breakdown?.find(
			(b) => b.included_usage === 500,
		);
		const lifetimeBreakdown = res.breakdown?.find(
			(b) => b.included_usage === 200,
		);

		expect(monthlyBreakdown).toMatchObject({
			included_usage: 500,
			balance: 500,
			usage: 0,
			interval: "month",
		});

		expect(lifetimeBreakdown).toMatchObject({
			included_usage: 200,
			balance: 200,
			usage: 0,
			interval: "lifetime",
		});
	});
});
