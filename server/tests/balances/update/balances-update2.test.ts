import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCusFeatureV3,
	ApiVersion,
	type LimitedItem,
} from "@autumn/shared";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { timeout } from "../../utils/genUtils.js";

const messagesFeature = constructArrearItem({
	featureId: TestFeature.Messages,
	price: 0.5,
	billingUnits: 1,
	includedUsage: 1000,
}) as LimitedItem;

const freeProd = constructProduct({
	type: "free",
	id: "usage-based",
	isDefault: false,
	items: [messagesFeature],
});

const testCase = "balances-update2";

describe(`${chalk.yellowBright("balances-update2: testing update balance after tracking into overage")}`, () => {
	const customerId = testCase;
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

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
		const feature = customer.features[TestFeature.Messages];

		expect(feature).toMatchObject({
			granted_balance: messagesFeature.included_usage,
			purchased_balance: 0,
			current_balance: messagesFeature.included_usage - usageAmount,
			usage: usageAmount,
		});

		const customerV1 = await autumnV1.customers.get(customerId);
		const featureV1 = customerV1.features[TestFeature.Messages];

		expect(featureV1).toMatchObject({
			included_usage: messagesFeature.included_usage,
			balance: messagesFeature.included_usage - usageAmount,
			usage: usageAmount,
		});
	});

	const usageAmount2 = 1231.131;
	const totalUsage = new Decimal(usageAmount).add(usageAmount2).toNumber();
	test("should track into overage and have correct v1 / v2 api cus feature", async () => {
		await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: usageAmount2,
		});

		await timeout(2000);

		const customer = await autumnV2.customers.get(customerId);
		const feature = customer.features[TestFeature.Messages];

		expect(feature).toMatchObject({
			granted_balance: messagesFeature.included_usage,
			purchased_balance: new Decimal(totalUsage)
				.sub(messagesFeature.included_usage)
				.toNumber(),
			current_balance: 0,
			usage: totalUsage,
		});

		const customerV1 = await autumnV1.customers.get(customerId);
		const featureV1 = customerV1.features[
			TestFeature.Messages
		] as unknown as ApiCusFeatureV3;

		expect(featureV1).toMatchObject({
			included_usage: messagesFeature.included_usage,
			balance: new Decimal(messagesFeature.included_usage)
				.sub(new Decimal(totalUsage))
				.toNumber(),
			usage: totalUsage,
		});
	});
	return;

	const newBalance = 300;
	test("should update balance and have correct v1 / v2 api cus feature", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: newBalance,
		});

		await timeout(2000);

		const customer = await autumnV2.customers.get(customerId);
		const feature = customer.features[TestFeature.Messages];

		expect(feature).toMatchObject({
			granted_balance: messagesFeature.included_usage,

			purchased_balance: new Decimal(totalUsage)
				.sub(messagesFeature.included_usage)
				.toNumber(),

			current_balance: newBalance,
			usage: totalUsage,
		});
	});
});
