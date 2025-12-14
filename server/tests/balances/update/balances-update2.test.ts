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
	items: [lifetimeMsges, monthlyMsges],
});

const testCase = "balances-update2";

describe(`${chalk.yellowBright("balances-update2: testing update balance after track (metered feature)")}`, () => {
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

	test("should update balance and have correct v2 api balance for one off interval", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: lifetimeMsges.included_usage + 140,
			interval: ResetInterval.OneOff,
		});

		const customerV2 = await autumnV2.customers.get<ApiCustomer>(customerId);
		const balance = customerV2.balances[TestFeature.Messages];

		expect(balance).toMatchObject({
			granted_balance:
				monthlyMsges.included_usage + lifetimeMsges.included_usage + 140,
			current_balance:
				monthlyMsges.included_usage + lifetimeMsges.included_usage + 140,
			usage: 0,
			purchased_balance: 0,
		});

		const lifetimeBreakdown = balance.breakdown?.find(
			(b) => b.reset?.interval === ResetInterval.OneOff,
		);
		expect(lifetimeBreakdown).toMatchObject({
			granted_balance: lifetimeMsges.included_usage + 140,
			current_balance: lifetimeMsges.included_usage + 140,
			purchased_balance: 0,
			usage: 0,
		});

		const monthlyBreakdown = balance.breakdown?.find(
			(b) => b.reset?.interval === ResetInterval.Month,
		);
		expect(monthlyBreakdown).toMatchObject({
			granted_balance: monthlyMsges.included_usage,
			current_balance: monthlyMsges.included_usage,
			purchased_balance: 0,
			usage: 0,
		});
	});

	test("should update balance and have correct v2 api balance for one off interval", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: monthlyMsges.included_usage + 120,
			interval: ResetInterval.Month,
		});

		const customerV2 = await autumnV2.customers.get<ApiCustomer>(customerId);
		const balance = customerV2.balances[TestFeature.Messages];

		expect(balance).toMatchObject({
			granted_balance:
				monthlyMsges.included_usage + lifetimeMsges.included_usage + 140 + 120,
			current_balance:
				monthlyMsges.included_usage + lifetimeMsges.included_usage + 140 + 120,
			usage: 0,
			purchased_balance: 0,
		});

		const lifetimeBreakdown = balance.breakdown?.find(
			(b) => b.reset?.interval === ResetInterval.OneOff,
		);
		expect(lifetimeBreakdown).toMatchObject({
			granted_balance: lifetimeMsges.included_usage + 140,
			current_balance: lifetimeMsges.included_usage + 140,
			purchased_balance: 0,
			usage: 0,
		});

		const monthlyBreakdown = balance.breakdown?.find(
			(b) => b.reset?.interval === ResetInterval.Month,
		);
		expect(monthlyBreakdown).toMatchObject({
			granted_balance: monthlyMsges.included_usage + 120,
			current_balance: monthlyMsges.included_usage + 120,
			purchased_balance: 0,
			usage: 0,
		});
	});
});
