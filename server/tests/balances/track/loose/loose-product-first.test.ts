import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type CheckResponseV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "loose-product-first";

const messagesFeature = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 10,
});

const testProduct = constructProduct({
	type: "free",
	isDefault: false,
	items: [messagesFeature],
});

describe(`${chalk.yellowBright("loose-product-first: deducts from product before loose entitlement")}`, () => {
	const customerId = testCase;
	const autumnV2 = new AutumnInt({ version: ApiVersion.V2_0 });
	const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		// Create product with 10 messages
		await initProductsV0({
			ctx,
			products: [testProduct],
			prefix: testCase,
		});

		// Attach product to customer
		await autumnV1.attach({
			customer_id: customerId,
			product_id: testProduct.id,
		});

		// Wait for product attachment
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Create loose entitlement with 50 messages (created AFTER product, so deducted second)
		await autumnV1.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			granted_balance: 50,
		});
	});

	test("should have combined balance of 60", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(true);
		expect(res.balance?.current_balance).toBe(60); // 10 from product + 50 from loose
	});

	test("should deduct from product first, then loose entitlement", async () => {
		// Track 15 messages (should use all 10 from product, then 5 from loose)
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 15,
		});

		await new Promise((resolve) => setTimeout(resolve, 2000));

		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(true);
		expect(res.balance?.current_balance).toBe(45); // 60 - 15
		expect(res.balance?.usage).toBe(15);
	});

	test("should continue deducting from loose after product exhausted", async () => {
		// Track 30 more messages (all from loose since product is exhausted)
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 30,
		});

		await new Promise((resolve) => setTimeout(resolve, 2000));

		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(true);
		expect(res.balance?.current_balance).toBe(15); // 45 - 30
		expect(res.balance?.usage).toBe(45); // 15 + 30
	});
});
