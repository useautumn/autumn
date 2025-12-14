import { beforeAll, describe, expect, test } from "bun:test";
import { type ApiCustomer, ApiVersion, type LimitedItem } from "@autumn/shared";
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
}) as LimitedItem;

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [messagesFeature],
});

const testCase = "balances-update1";

describe(`${chalk.yellowBright("balances-update1: testing update balance after track (metered feature)")}`, () => {
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
			products: [freeProd],
			prefix: testCase,
		});

		await autumnV2.attach({
			customer_id: customerId,
			product_id: freeProd.id,
		});
	});

	test("should track usage and have correct v1 / v2 api cus feature", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: messagesFeature.included_usage + 140,
		});

		const customerV2 = await autumnV2.customers.get<ApiCustomer>(customerId);
		const balance = customerV2.balances[TestFeature.Messages];

		expect(balance).toMatchObject({
			granted_balance: messagesFeature.included_usage + 140,
			current_balance: messagesFeature.included_usage + 140,
			usage: 0,
			purchased_balance: 0,
		});
	});
});
