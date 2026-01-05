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
	includedUsage: 100,
}) as LimitedItem;

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [messagesFeature],
});

const testCase = "update-current-balance1";

describe(`${chalk.yellowBright("update-current-balance1: update monthly balance from 100 to 80 then to 120")}`, () => {
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

	test("should update current balance from 100 to 80, granted balance should also be 80", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 80,
		});

		const customerV2 = await autumnV2.customers.get<ApiCustomer>(customerId);
		const balance = customerV2.balances[TestFeature.Messages];

		expect(balance).toMatchObject({
			granted_balance: 80,
			current_balance: 80,
			usage: 0,
			purchased_balance: 0,
		});

		// Verify DB sync with skip_cache
		const customerFromDb = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{
				skip_cache: "true",
			},
		);
		const balanceFromDb = customerFromDb.balances[TestFeature.Messages];

		expect(balanceFromDb).toMatchObject({
			granted_balance: 80,
			current_balance: 80,
			usage: 0,
			purchased_balance: 0,
		});
	});

	test("should update current balance from 80 to 120, granted balance should also be 120", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 120,
		});

		const customerV2 = await autumnV2.customers.get<ApiCustomer>(customerId);
		const balance = customerV2.balances[TestFeature.Messages];

		expect(balance).toMatchObject({
			granted_balance: 120,
			current_balance: 120,
			usage: 0,
			purchased_balance: 0,
		});

		const customerFromDb = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{
				skip_cache: "true",
			},
		);
		const balanceFromDb = customerFromDb.balances[TestFeature.Messages];

		expect(balanceFromDb).toMatchObject({
			granted_balance: 120,
			current_balance: 120,
			usage: 0,
			purchased_balance: 0,
		});
	});
});
