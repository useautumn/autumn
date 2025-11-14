import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCusFeatureV3,
	ApiVersion,
	type LimitedItem,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { timeout } from "../../utils/genUtils.js";

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
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

	const usage = 20.132;

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

	const usageAmount = 20.132;
	test("should track usage and have correct v1 / v2 api cus feature", async () => {
		await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: usageAmount,
		});

		await timeout(2000);
		const customer = await autumnV2.customers.get(customerId);
		const feature = customer.features[TestFeature.Messages] as any;

		const currentBalance = new Decimal(messagesFeature.included_usage)
			.minus(usage)
			.toNumber();

		expect(feature).toMatchObject({
			granted_balance: messagesFeature.included_usage,
			current_balance: currentBalance,
			usage,
			purchased_balance: 0,
		});

		const customerV1 = await autumnV1.customers.get(customerId);
		const featureV1 = customerV1.features[
			TestFeature.Messages
		] as unknown as ApiCusFeatureV3;

		expect(featureV1).toMatchObject({
			included_usage: messagesFeature.included_usage,
			balance: currentBalance,
			usage,
		});
		expect(featureV1.next_reset_at).toBeDefined();
	});

	test("should update balance and have correct v1/v2 api cus feature", async () => {
		// Restore back to original granted balance (new granted is 20.132)
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: messagesFeature.included_usage,
		});

		await timeout(2000);

		const customer = await autumnV2.customers.get(customerId);
		const feature = customer.features[TestFeature.Messages];

		expect(feature).toMatchObject({
			granted_balance: messagesFeature.included_usage + usageAmount,
			current_balance: messagesFeature.included_usage,
			usage: usageAmount,
			purchased_balance: 0,
		});

		const customerV1 = await autumnV1.customers.get(customerId);
		const featureV1 = customerV1.features[TestFeature.Messages];

		expect(featureV1).toMatchObject({
			included_usage: messagesFeature.included_usage + usageAmount,
			balance: messagesFeature.included_usage,
			usage: usageAmount,
		});
	});
});
