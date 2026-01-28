import { beforeAll, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	type CheckResponseV1,
	type CheckResponseV2,
	type LimitedItem,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	constructArrearItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { timeout } from "../../../utils/genUtils";

const prepaidItem = constructPrepaidItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
	billingUnits: 100,
	price: 8.5,
}) as LimitedItem;

const usageItem = constructArrearItem({
	featureId: TestFeature.Messages,
	includedUsage: 200,
	price: 0.5,
	billingUnits: 1,
	usageLimit: 500,
}) as LimitedItem;

const prod = constructProduct({
	type: "free",
	isDefault: false,
	items: [prepaidItem, usageItem],
});

const testCase = "check-prepaid2";

describe(`${chalk.yellowBright("check-prepaid2: test /check on prepaid + pay per use feature")}`, () => {
	const customerId = testCase;
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

	const prepaidQuantity = 500;
	const grantedBalance = prepaidItem.included_usage + usageItem.included_usage;

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [prod],
			prefix: testCase,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: prod.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: prepaidQuantity,
				},
			],
		});
	});

	test("should have correct v2 response for empty usage", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(res).toMatchObject({
			allowed: true,
			customer_id: customerId,
			required_balance: 1,
			balance: {
				feature_id: TestFeature.Messages,
				unlimited: false,
				granted_balance: grantedBalance,
				purchased_balance: prepaidQuantity,
				current_balance: prepaidQuantity + grantedBalance,
				usage: 0,
				max_purchase: null,
				overage_allowed: true,
				reset: {
					interval: prepaidItem.interval,
				},
			},
		});

		expect(res.balance?.reset?.resets_at).toBeDefined();

		const expectedPrepaidBreakdown = {
			granted_balance: prepaidItem.included_usage,
			purchased_balance: prepaidQuantity,
			current_balance: prepaidQuantity + prepaidItem.included_usage,
			usage: 0,
			max_purchase: null,
			overage_allowed: false,
			reset: expect.objectContaining({
				interval: "month",
			}),
		};

		const expectedUsageBreakdown = {
			granted_balance: usageItem.included_usage,
			purchased_balance: 0,
			current_balance: usageItem.included_usage,
			usage: 0,
			max_purchase: 300,
			overage_allowed: true,
			reset: expect.objectContaining({
				interval: "month",
			}),
		};

		expect(res.balance?.breakdown).toHaveLength(2);
		expect(res.balance?.breakdown).toContainEqual(
			expect.objectContaining(expectedPrepaidBreakdown),
		);
		expect(res.balance?.breakdown).toContainEqual(
			expect.objectContaining(expectedUsageBreakdown),
		);
	});

	test("should have correct v1 response for empty usage", async () => {
		const res = (await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV1;

		expect(res).toMatchObject({
			allowed: true,
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 1,
			interval: prepaidItem.interval,
			unlimited: false,
			included_usage: prepaidQuantity + grantedBalance,
			balance: prepaidQuantity + grantedBalance,
			usage: 0,
		});
	});

	let curUsage = 0;
	test("should track 500 and verify check response uses prepaid balance first", async () => {
		await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 500,
		});

		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		const expectedCurrentBalance = prepaidQuantity + grantedBalance - 500;
		curUsage = 500;

		const balance = res.balance;

		expect(balance?.granted_balance).toBe(grantedBalance);
		expect(balance?.current_balance).toBe(expectedCurrentBalance);
		expect(balance?.usage).toBe(curUsage);
		expect(balance?.purchased_balance).toBe(500);

		expect(res.balance?.breakdown).toContainEqual(
			expect.objectContaining({
				granted_balance: prepaidItem.included_usage,
				purchased_balance: prepaidQuantity,
				current_balance:
					prepaidQuantity + prepaidItem.included_usage - curUsage,
				usage: curUsage,
				overage_allowed: false,
			}),
		);
	});

	// Balances at this point:
	test("should track another 500 -- 100 from prepaid, 200 from usage-based granted, 200 paid", async () => {
		await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 500,
		});

		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		curUsage = curUsage + 500;

		const balance = res.balance;

		expect(balance).toMatchObject({
			granted_balance: grantedBalance,
			current_balance: 0,
			usage: curUsage,
			purchased_balance: prepaidQuantity + 200,
		});

		expect(res.balance?.breakdown).toContainEqual(
			expect.objectContaining({
				granted_balance: prepaidItem.included_usage,
				purchased_balance: prepaidQuantity,
				current_balance: 0,
				usage: 600,
				overage_allowed: false,
			}),
		);

		expect(res.balance?.breakdown).toContainEqual(
			expect.objectContaining({
				granted_balance: usageItem.included_usage,
				purchased_balance: 200,
				current_balance: 0,
				usage: 400,
				overage_allowed: true,
			}),
		);
	});

	test("should track another 200 and only 100 used due to usage limit", async () => {
		await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 200,
		});

		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		curUsage = curUsage + 100;

		const balance = res.balance;
		expect(balance).toMatchObject({
			usage: curUsage,
			purchased_balance: prepaidQuantity + 300,
		});

		expect(res.balance?.breakdown).toContainEqual(
			expect.objectContaining({
				granted_balance: usageItem.included_usage,
				purchased_balance: 300,
				current_balance: 0,
				usage: 500,
				max_purchase: 300,
				overage_allowed: true,
			}),
		);
	});

	test("should check that non-cached customer returns correct response", async () => {
		await timeout(4000);
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		})) as unknown as CheckResponseV2;

		expect(res.balance).toMatchObject({
			granted_balance: grantedBalance,
			current_balance: 0,
			usage: curUsage,
			purchased_balance: prepaidQuantity + 300,
		});

		expect(res.balance?.breakdown).toContainEqual(
			expect.objectContaining({
				granted_balance: prepaidItem.included_usage,
				purchased_balance: prepaidQuantity,
				current_balance: 0,
				usage: 600,
				overage_allowed: false,
			}),
		);

		expect(res.balance?.breakdown).toContainEqual(
			expect.objectContaining({
				granted_balance: usageItem.included_usage,
				purchased_balance: 300,
				current_balance: 0,
				usage: 500,
				max_purchase: 300,
				overage_allowed: true,
			}),
		);
	});
});
