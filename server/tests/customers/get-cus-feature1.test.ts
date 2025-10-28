import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCusFeature,
	ApiVersion,
	type LimitedItem,
} from "@autumn/shared";
import chalk from "chalk";
import { TestFeature } from "tests/setup/v2Features.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
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

describe(`${chalk.yellowBright("get-cus-feature1: get customer, free metered feature")}`, () => {
	const customerId = testCase;
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2 });

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

	test("should track usage, and have correct customer feature fields", async () => {
		const usage = 20.25;
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

		expect(feature.granted_balance).toBe(messagesFeature.included_usage);
		expect(feature.purchased_balance).toBe(0);
		expect(feature.current_balance).toBe(
			messagesFeature.included_usage - usage,
		);
		expect(feature.usage).toBe(usage);
	});
});
