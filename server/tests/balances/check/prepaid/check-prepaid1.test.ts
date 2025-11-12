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
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const prepaidMessagesFeature = constructPrepaidItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
	billingUnits: 100,
	price: 8.5,
}) as LimitedItem;

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [prepaidMessagesFeature],
});

const testCase = "check-prepaid1";

describe(`${chalk.yellowBright("check-prepaid1: test /check when prepaid feature attached")}`, () => {
	const customerId = testCase;
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

	const prepaidQuantity = 500;
	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [freeProd],
			prefix: testCase,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: freeProd.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: prepaidQuantity,
				},
			],
		});
	});

	test("should have correct v2 response", async () => {
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
				granted_balance: prepaidMessagesFeature.included_usage,
				purchased_balance: prepaidQuantity,
				current_balance:
					prepaidQuantity + prepaidMessagesFeature.included_usage,
				usage: 0,

				max_purchase: null,
				overage_allowed: false,
				reset: {
					interval: "month",
				},
			},
		});

		expect(res.balance?.reset?.resets_at).toBeDefined();
	});

	test("should have allowed true if value is less than current balance", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance:
				prepaidQuantity + prepaidMessagesFeature.included_usage - 1,
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(true);
	});

	test("should have allowed false if value is greater than current balance", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance:
				prepaidQuantity + prepaidMessagesFeature.included_usage + 1,
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(false);
	});

	test("should have correct v1 response", async () => {
		const res = (await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV1;

		expect(res).toMatchObject({
			allowed: true,
			code: "feature_found",
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 1,
			interval: "month",
			interval_count: 1,
			unlimited: false,
			balance: prepaidQuantity + prepaidMessagesFeature.included_usage,
			usage: 0,
			included_usage: prepaidQuantity + prepaidMessagesFeature.included_usage,
			overage_allowed: false,
		});
	});
});
