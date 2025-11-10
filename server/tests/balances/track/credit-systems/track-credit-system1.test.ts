import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type LimitedItem } from "@autumn/shared";
import chalk from "chalk";
import { TestFeature } from "tests/setup/v2Features.js";
import { timeout } from "tests/utils/genUtils.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const creditsFeature = constructFeatureItem({
	featureId: TestFeature.Credits,
	includedUsage: 100,
}) as LimitedItem;

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [creditsFeature],
});

const testCase = "track-credit-system1";

describe(`${chalk.yellowBright("track-credit-system1: track credits directly")}`, () => {
	const customerId = "track-credit-system1";
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

	test("should have initial balance of 100 credits", async () => {
		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Credits].balance;

		expect(balance).toBe(100);
	});

	test("should deduct from credits directly", async () => {
		const deductValue = 27.35;

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			value: deductValue,
		});

		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Credits].balance;
		const usage = customer.features[TestFeature.Credits].usage;

		expect(balance).toBe(100 - deductValue);
		expect(usage).toBe(deductValue);
	});

	test("should reflect deduction in non-cached customer after 2s", async () => {
		const deductValue = 27.35;

		// Wait 2 seconds for DB sync
		await timeout(2000);

		// Fetch customer with skip_cache=true
		const customer = await autumnV1.customers.get(customerId, {
			skip_cache: "true",
		});
		const balance = customer.features[TestFeature.Credits].balance;
		const usage = customer.features[TestFeature.Credits].usage;

		expect(balance).toBe(100 - deductValue);
		expect(usage).toBe(deductValue);
	});
});
