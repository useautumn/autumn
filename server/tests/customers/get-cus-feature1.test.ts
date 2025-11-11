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
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import type { ApiCusFeatureV3 } from "../../../shared/api/customers/cusFeatures/previousVersions/apiCusFeatureV3.js";
import { timeout } from "../utils/genUtils.js";

const messagesFeature = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 1000,
}) as LimitedItem;

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [messagesFeature],
});

const testCase = "get-cus-feature1";

describe(`${chalk.yellowBright("get-cus-feature1: testing current balance + usage")}`, () => {
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

	test("should track usage and have correct v1 / v2 api cus feature", async () => {
		await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: usage,
		});

		await timeout(2000);
		const customer = await autumnV2.customers.get(customerId);
		const feature = customer.features[
			TestFeature.Messages
		] as unknown as ApiCusFeature;

		const currentBalance = new Decimal(messagesFeature.included_usage)
			.minus(usage)
			.toNumber();

		expect(feature).toMatchObject({
			granted_balance: messagesFeature.included_usage,
			purchased_balance: 0,
			current_balance: currentBalance,
			usage,
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
	return;

	test("should update balance and have correct v2 api cus feature", async () => {
		// await autumnV2.balances.update({
		// 	customer_id: customerId,
		// 	feature_id: TestFeature.Messages,
		// 	current_balance: 1000,
		// });
		// await timeout(2000);
		// const cusEnt = await getCusEntByFeature({
		// 	db: ctx.db,
		// 	org: ctx.org,
		// 	env: ctx.env,
		// 	customerId,
		// 	featureId: TestFeature.Messages,
		// });
		// await autumnV2.updateCusEnt({
		// 	customerId,
		// 	customerEntitlementId: cusEnt.id,
		// 	updates: {
		// 		balance: 1000,
		// 	},
		// });
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
		expect(feature.resets_at).toBeDefined();
	});

	test("should have correct v1 api cus feature", async () => {
		const customer = await autumnV1.customers.get(customerId);
		const feature = customer.features[
			TestFeature.Messages
		] as unknown as ApiCusFeatureV3;

		expect(feature).toMatchObject({
			included_usage: messagesFeature.included_usage,
			balance: 1000,
			usage,
		});
		expect(feature.next_reset_at).toBeDefined();
	});
});
