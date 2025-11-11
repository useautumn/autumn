import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const messagesFeature = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
});

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [messagesFeature],
});

const testCase = "track-legacy1";

describe(`${chalk.yellowBright("track-legacy1: test legacy properties format with value")}`, () => {
	const customerId = "track-legacy1";
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

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

	test("should have initial balance of 100", async () => {
		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Messages].balance;

		expect(balance).toBe(100);
	});

	test("should deduct value from properties object", async () => {
		const initialBalance = 100;
		const deductValue = 35.82;

		// Legacy format: properties.value instead of value
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			properties: {
				value: deductValue,
			},
		});

		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Messages].balance;
		const usage = customer.features[TestFeature.Messages].usage;

		const expectedBalance = new Decimal(initialBalance)
			.sub(deductValue)
			.toNumber();

		expect(balance).toBe(expectedBalance);
		expect(usage).toBe(deductValue);
	});
});
