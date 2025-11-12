import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { timeout } from "@tests/utils/genUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "track-basic11";
const customerId = testCase;

const messagesFeature = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
});

const product = constructProduct({
	// id: "pro",
	items: [messagesFeature],
	type: "free",
	isDefault: false,
});

describe(`${chalk.yellowBright(`${testCase}: Testing negative values (refunds/credits)`)}`, () => {
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		await initProductsV0({
			ctx,
			products: [product],
			prefix: testCase,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: product.id,
		});
	});

	test("should have initial balance of 100", async () => {
		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Messages].balance;

		expect(balance).toBe(100);
	});

	test("should deduct 30 units", async () => {
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 30,
		});

		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Messages].balance;
		const usage = customer.features[TestFeature.Messages].usage;

		expect(balance).toBe(70);
		expect(usage).toBe(30);
	});

	test("should refund 10 units (negative value)", async () => {
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: -10,
		});

		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Messages].balance;
		const usage = customer.features[TestFeature.Messages].usage;

		// Balance should increase by 10
		expect(balance).toBe(80);
		// Usage should decrease by 10
		expect(usage).toBe(20);
	});

	test("should reflect refund in non-cached customer after 2s", async () => {
		// Wait 2 seconds for DB sync
		await timeout(2000);

		// Fetch customer with skip_cache=true
		const customer = await autumnV1.customers.get(customerId, {
			skip_cache: "true",
		});
		const balance = customer.features[TestFeature.Messages].balance;
		const usage = customer.features[TestFeature.Messages].usage;

		expect(balance).toBe(80);
		expect(usage).toBe(20);
	});

	test("should handle refund larger than usage (usage can go negative)", async () => {
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: -50, // Refunding more than current usage (20)
		});

		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Messages].balance;
		const usage = customer.features[TestFeature.Messages].usage;

		// Balance should increase by full 50
		expect(balance).toBe(130);
		// Usage should decrease by 50 (from 20 to -30)
		expect(usage).toBe(-30);
	});

	test("should reflect large refund in non-cached customer after 2s", async () => {
		// Wait 2 seconds for DB sync
		await timeout(5000);

		// Fetch customer with skip_cache=true
		const customer = await autumnV1.customers.get(customerId, {
			skip_cache: "true",
		});
		const balance = customer.features[TestFeature.Messages].balance;
		const usage = customer.features[TestFeature.Messages].usage;

		expect(balance).toBe(130);
		expect(usage).toBe(-30);
	});
});
