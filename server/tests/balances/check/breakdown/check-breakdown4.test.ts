import { beforeAll, describe, expect, test } from "bun:test";
import {
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
 * Test: Two products with different monthly message balances
 * Expected: breakdown array with 2 items (same interval, different products)
 */

const monthlyMessages1 = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 1000,
	interval: ProductItemInterval.Month,
});

const monthlyMessages2 = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 500,
	interval: ProductItemInterval.Month,
});

const prod1 = constructProduct({
	type: "free",
	id: "prod1",
	isDefault: false,
	items: [monthlyMessages1],
});

const prod2 = constructProduct({
	type: "free",
	id: "prod2",
	isAddOn: true,
	isDefault: false,
	items: [monthlyMessages2],
});

const testCase = "check-breakdown4";

describe(`${chalk.yellowBright("check-breakdown4: two products with different monthly balances = 2 breakdown items")}`, () => {
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
			products: [prod1, prod2],
			prefix: testCase,
		});

		// Attach both products
		await autumnV2.attach({
			customer_id: customerId,
			product_id: prod1.id,
		});

		await autumnV2.attach({
			customer_id: customerId,
			product_id: prod2.id,
		});
	});

	test("should have correct parent balance and 2 breakdown items", async () => {
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		// Parent balance should sum both products
		expect(res.balance).toMatchObject({
			granted_balance: 1500, // 1000 + 500
			current_balance: 1500,
			usage: 0,
			plan_id: null, // null when multiple products
			reset: {
				interval: "month",
			},
		});

		// Should have 2 breakdown items with unique IDs
		const breakdown = res.balance?.breakdown;
		expect(breakdown).toHaveLength(2);
		expect(new Set(breakdown?.map((b) => b.id)).size).toBe(2);
	});

	test("breakdown items should have correct values", async () => {
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		const breakdown1 = res.balance?.breakdown?.find(
			(b) => b.granted_balance === 1000,
		);
		const breakdown2 = res.balance?.breakdown?.find(
			(b) => b.granted_balance === 500,
		);

		expect(breakdown1).toMatchObject({
			granted_balance: 1000,
			current_balance: 1000,
			usage: 0,
			plan_id: prod1.id,
			reset: {
				interval: "month",
			},
		});

		expect(breakdown2).toMatchObject({
			granted_balance: 500,
			current_balance: 500,
			usage: 0,
			plan_id: prod2.id,
			reset: {
				interval: "month",
			},
		});
	});
});
