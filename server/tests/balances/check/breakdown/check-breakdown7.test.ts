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
import {
	constructFeatureItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const freeMonthlyMessages = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 500,
	interval: ProductItemInterval.Month,
});

const topUpMessages = constructPrepaidItem({
	featureId: TestFeature.Messages,
	billingUnits: 100,
	price: 10,
	isOneOff: true,
});

const freeProd = constructProduct({
	type: "free",
	id: "free-prod",
	isDefault: false,
	items: [freeMonthlyMessages],
});

const topUpProd = constructProduct({
	type: "free",
	id: "topup-prod",
	isAddOn: true,
	isDefault: false,
	items: [topUpMessages],
});

const testCase = "check-breakdown7";

describe(`${chalk.yellowBright("check-breakdown7: free monthly messages + one-off top-up = 2 breakdown items")}`, () => {
	const customerId = testCase;
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });
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
			products: [freeProd, topUpProd],
			prefix: testCase,
		});

		await autumnV2.attach({
			customer_id: customerId,
			product_id: freeProd.id,
		});

		await autumnV2.attach({
			customer_id: customerId,
			product_id: topUpProd.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 200,
				},
			],
		});
	});

	test("v2: should have correct parent balance and 2 breakdown items", async () => {
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(res.balance).toMatchObject({
			granted_balance: 500,
			current_balance: 700,
			purchased_balance: 200,
			usage: 0,
			plan_id: null,
		});

		const breakdown = res.balance?.breakdown;
		expect(breakdown).toHaveLength(2);
		expect(new Set(breakdown?.map((b) => b.id)).size).toBe(2);
	});

	test("v2: breakdown items should have correct values", async () => {
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		const freeBreakdown = res.balance?.breakdown?.find(
			(b) => b.plan_id === freeProd.id,
		);
		const topUpBreakdown = res.balance?.breakdown?.find(
			(b) => b.plan_id === topUpProd.id,
		);

		expect(freeBreakdown).toMatchObject({
			granted_balance: 500,
			current_balance: 500,
			usage: 0,
			plan_id: freeProd.id,
			reset: {
				interval: "month",
			},
		});

		expect(topUpBreakdown).toMatchObject({
			granted_balance: 0,
			current_balance: 200,
			purchased_balance: 200,
			usage: 0,
			plan_id: topUpProd.id,
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

		expect(res.included_usage).toBe(700);
		expect(res.balance).toBe(700);
		expect(res.usage).toBe(0);

		expect(res.breakdown).toHaveLength(2);
	});

	test("v1.2: breakdown items should have correct values", async () => {
		const res = (await autumnV1.check<CheckResponseV1>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV1;

		const freeBreakdown = res.breakdown?.[0];
		const topUpBreakdown = res.breakdown?.[1];

		expect(freeBreakdown).toMatchObject({
			included_usage: 500,
			balance: 500,
			usage: 0,
			interval: "month",
		});

		expect(topUpBreakdown).toMatchObject({
			included_usage: 200,
			balance: 200,
			usage: 0,
			interval: "lifetime",
		});
	});
});
