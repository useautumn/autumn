import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCustomer,
	ApiVersion,
	type LimitedItem,
	ResetInterval,
} from "@autumn/shared";
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

const lifetimeMsges = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 50,
	interval: null,
}) as LimitedItem;

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [monthlyMsges, lifetimeMsges],
});

const testCase = "update-granted-balance2";

describe(`${chalk.yellowBright("update-granted-balance2: testing update granted balance when there's a breakdown")}`, () => {
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

	test("should update granted balance to 150 for monthly feature", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 50,
			granted_balance: 75,
			interval: ResetInterval.Month,
		});

		const customerV2 = await autumnV2.customers.get<ApiCustomer>(customerId);
		const balance = customerV2.balances[TestFeature.Messages];

		const monthlyBreakdown = balance.breakdown?.find(
			(b) => b.reset?.interval === ResetInterval.Month,
		);

		const lifetimeBreakdown = balance.breakdown?.find(
			(b) => b.reset?.interval === ResetInterval.OneOff,
		);

		expect(monthlyBreakdown).toMatchObject({
			granted_balance: 75,
			current_balance: 50,
			usage: 25,
			purchased_balance: 0,
		});

		expect(lifetimeBreakdown).toMatchObject({
			granted_balance: 50,
			current_balance: 50,
			usage: 0,
			purchased_balance: 0,
		});
	});
});
