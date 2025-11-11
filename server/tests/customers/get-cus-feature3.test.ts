import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCusFeature,
	ApiVersion,
	type LimitedItem,
} from "@autumn/shared";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { TestFeature } from "tests/setup/v2Features.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { constructProduct } from "../../src/utils/scriptUtils/createTestProducts.js";
import { timeout } from "../utils/genUtils.js";

const userFeature = constructFeatureItem({
	featureId: TestFeature.Users,
	includedUsage: 10,
}) as LimitedItem;

const proProd = constructProduct({
	items: [userFeature],
	type: "free",
	isDefault: false,
});

const testCase = "get-cus-feature3";

describe(`${chalk.yellowBright("get-cus-feature3: testing arrear feature")}`, () => {
	const customerId = testCase;
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

	const usage = 20.132;

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [proProd],
			prefix: testCase,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: proProd.id,
		});
	});

	test("should attach pro product to customer", async () => {
		await autumnV1.attach({
			customer_id: customerId,
			product_id: proProd.id,
		});
	});

	return;

	const usageAmount = 20.132;
	test("should track usage and have correct v1 / v2 api cus feature", async () => {
		await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: usageAmount,
		});

		await timeout(2000);

		const customer = await autumnV2.customers.get(customerId);
		const feature = customer.features[
			TestFeature.Messages
		] as unknown as ApiCusFeature;

		expect(feature).toMatchObject({
			granted_balance: messagesFeature.included_usage,
			purchased_balance: 0,
			current_balance: 1000,
			usage: usageAmount,
		});

		const customerV1 = await autumnV1.customers.get(customerId);
		const featureV1 = customerV1.features[
			TestFeature.Messages
		] as unknown as ApiCusFeature;

		expect(featureV1).toMatchObject({
			included_usage: messagesFeature.included_usage,
			balance: 1000,
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
		const feature = customer.features[
			TestFeature.Messages
		] as unknown as ApiCusFeature;

		expect(feature).toMatchObject({
			granted_balance: messagesFeature.included_usage,
			purchased_balance: new Decimal(totalUsage)
				.sub(messagesFeature.included_usage)
				.toNumber(),
			current_balance: 0,
			usage: totalUsage,
		});

		// const customerV1 = await autumnV1.customers.get(customerId);
		// const featureV1 = customerV1.features[
		//   TestFeature.Messages
		// ] as unknown as ApiCusFeatureV3;

		// expect(featureV1).toMatchObject({
		//   included_usage: messagesFeature.included_usage,
		//   balance: 0,
		//   usage: totalUsage,
	});

	test("should have correct v2 api cus feature", async () => {
		const customer = await autumnV2.customers.get(customerId);
		const feature = customer.features[
			TestFeature.Messages
		] as unknown as ApiCusFeature;

		expect(feature).toMatchObject({
			granted_balance: messagesFeature.included_usage,
			purchased_balance: 0,
			current_balance: 1000,
			usage,
		});
	});

	test("should have correct v1 api cus feature", async () => {
		const customer = await autumnV1.customers.get(customerId);
		const feature = customer.features[
			TestFeature.Messages
		] as unknown as ApiCusFeature;

		expect(feature).toMatchObject({
			included_usage: messagesFeature.included_usage,
			balance: 1000,
			usage,
		});
	});
});
