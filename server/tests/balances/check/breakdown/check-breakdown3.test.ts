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

const monthlyPayPerUseMessages = constructArrearItem({
	featureId: TestFeature.Messages,
	includedUsage: 500,
	price: 0.01,
	billingUnits: 1,
});

const lifetimeMessages = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 200,
	interval: null,
});

const payPerUseProd = constructProduct({
	type: "free",
	id: "pay-per-use-prod",
	isDefault: false,
	items: [monthlyPayPerUseMessages],
});

const lifetimeProd = constructProduct({
	type: "free",
	id: "lifetime-prod",
	isAddOn: true,
	isDefault: false,
	items: [lifetimeMessages],
});

const testCase = "check-breakdown3";

describe(`${chalk.yellowBright("check-breakdown3: monthly pay-per-use + lifetime messages = 2 breakdown items")}`, () => {
	const customerId = testCase;
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			attachPm: "success",
			withTestClock: false,
		});

		await initProductsV0({
			ctx,
			products: [payPerUseProd, lifetimeProd],
			prefix: testCase,
		});

		await autumnV2.attach({
			customer_id: customerId,
			product_id: payPerUseProd.id,
		});

		await autumnV2.attach({
			customer_id: customerId,
			product_id: lifetimeProd.id,
		});
	});

	test("should have correct parent balance and 2 breakdown items", async () => {
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(res.balance).toMatchObject({
			granted_balance: 700,
			current_balance: 700,
			usage: 0,
			overage_allowed: true,
			plan_id: null,
		});

		const breakdown = res.balance?.breakdown;
		expect(breakdown).toHaveLength(2);
		expect(new Set(breakdown?.map((b) => b.id)).size).toBe(2);
	});

	test("breakdown items should have correct values", async () => {
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		const payPerUseBreakdown = res.balance?.breakdown?.find(
			(b) => b.overage_allowed === true,
		);
		const lifetimeBreakdown = res.balance?.breakdown?.find(
			(b) => b.overage_allowed === false,
		);

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

		expect(lifetimeBreakdown).toMatchObject({
			granted_balance: 200,
			current_balance: 200,
			usage: 0,
			overage_allowed: false,
			plan_id: lifetimeProd.id,
			reset: {
				interval: "one_off",
				resets_at: null,
			},
		});
	});
});
