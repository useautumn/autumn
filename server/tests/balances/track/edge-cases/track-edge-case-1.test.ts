import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const messagesFeature = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 1000,
});

const creditsFeature = constructFeatureItem({
	featureId: TestFeature.Credits,
	includedUsage: 500,
});

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [messagesFeature, creditsFeature],
});

const testCase = "track-edge-cases1";

describe(`${chalk.yellowBright("track-edge-case1: replicate floating point error with credits")}`, () => {
	const customerId = "track-edge-case1";
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
			products: [freeProd],
			prefix: testCase,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: freeProd.id,
		});
	});

	test("should have initial balances", async () => {
		const customer = await autumnV1.customers.get(customerId);
		const creditsBalance = customer.features[TestFeature.Credits].balance;

		expect(creditsBalance).toBe(500);
	});

	test("should replicate floating point error with credits - track multiple weird decimals", async () => {
		// Track several weird decimal values that might cause floating point errors
		const value1 = 0.1; // Simple decimal
		await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: value1,
		});

		const value2 = 0.2; // Another simple decimal
		await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: value2,
		});

		// Now try to check with send_event=true for exactly the remaining balance
		// After tracking 0.1 + 0.2 = 0.3, we should have 499.7 remaining
		// But due to floating point: 0.1 + 0.2 = 0.30000000000000004

		const checkValue = 10.3;

		// This should work, but might fail due to floating point errors in Lua
		const checkRes = await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: checkValue,
			send_event: true,
		});

		expect(checkRes.allowed).toBe(true);
		expect(checkRes.balance).toBeDefined();
	});
});
