import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type CheckResponseV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	constructArrearItem,
	constructFeatureItem,
} from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

/**
 * Test: Prepaid monthly messages + Pay-per-use monthly messages from different products
 * Expected: breakdown array with 2 items (same interval, different overage_allowed)
 */

const prepaidMonthlyMessages = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 1000,
});

const payPerUseMonthlyMessages = constructArrearItem({
	featureId: TestFeature.Messages,
	includedUsage: 500,
	price: 0.01,
	billingUnits: 1,
});

const prepaidProd = constructProduct({
	type: "free",
	id: "prepaid-prod",
	isDefault: false,
	items: [prepaidMonthlyMessages],
});

const payPerUseProd = constructProduct({
	type: "free",
	id: "pay-per-use-prod",
	isAddOn: true,
	isDefault: false,
	items: [payPerUseMonthlyMessages],
});

const testCase = "check-breakdown5";

describe(`${chalk.yellowBright("check-breakdown5: prepaid monthly + pay-per-use monthly = 2 breakdown items")}`, () => {
	const customerId = testCase;
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			attachPm: "success", // Required for pay-per-use
			withTestClock: false,
		});

		await initProductsV0({
			ctx,
			products: [prepaidProd, payPerUseProd],
			prefix: testCase,
		});

		// Attach both products
		await autumnV2.attach({
			customer_id: customerId,
			product_id: prepaidProd.id,
		});

		await autumnV2.attach({
			customer_id: customerId,
			product_id: payPerUseProd.id,
		});
	});

	test("should have correct parent balance and 2 breakdown items", async () => {
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		// Parent balance should sum both products, overage_allowed true if any breakdown allows
		expect(res.balance).toMatchObject({
			granted_balance: 1500, // 1000 + 500
			current_balance: 1500,
			usage: 0,
			overage_allowed: true, // true because pay-per-use allows overage
			plan_id: null,
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

		const prepaidBreakdown = res.balance?.breakdown?.find(
			(b) => b.overage_allowed === false,
		);
		const payPerUseBreakdown = res.balance?.breakdown?.find(
			(b) => b.overage_allowed === true,
		);

		// Prepaid breakdown (no overage)
		expect(prepaidBreakdown).toMatchObject({
			granted_balance: 1000,
			current_balance: 1000,
			usage: 0,
			overage_allowed: false,
			plan_id: prepaidProd.id,
			reset: {
				interval: "month",
			},
		});

		// Pay-per-use breakdown (overage allowed)
		expect(payPerUseBreakdown).toMatchObject({
			granted_balance: 500,
			current_balance: 500,
			usage: 0,
			overage_allowed: true,
			plan_id: payPerUseProd.id,
			reset: {
				interval: "month",
			},
		});
	});
});
