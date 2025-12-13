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

const monthlyMsges = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
}) as LimitedItem;

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [monthlyMsges],
});

const testCase = "update-granted-balance4";

describe(`${chalk.yellowBright("update-granted-balance4: testing update current balance, then update granted balance")}`, () => {
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

	test("should update current balance to 50", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 50,
		});

		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		const balance = customer.balances[TestFeature.Messages];

		expect(balance).toMatchObject({
			granted_balance: 50,
			current_balance: 50,
			usage: 0,
			purchased_balance: 0,
		});
	});

	test("should update granted balance to 100", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			granted_balance: 100,
			current_balance: 50,
		});

		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		const balance = customer.balances[TestFeature.Messages];

		expect(balance).toMatchObject({
			granted_balance: 100,
			current_balance: 50,
			usage: 50,
			purchased_balance: 0,
		});
	});
});
