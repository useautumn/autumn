import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import chalk from "chalk";
import { TestFeature } from "tests/setup/v2Features.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const messagesFeature = constructFeatureItem({
	featureId: TestFeature.Messages,
	unlimited: true,
});

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [messagesFeature],
});

const testCase = "track-basic7";

describe(`${chalk.yellowBright("track-basic7: track with unlimited balance")}`, () => {
	const customerId = "track-basic7";
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

	test("should have unlimited balance initially", async () => {
		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Messages].balance;
		const unlimited = customer.features[TestFeature.Messages].unlimited;

		expect(balance).toBe(0);
		expect(unlimited).toBe(true);
	});

	test("should remain unlimited after tracking without value", async () => {
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Messages].balance;
		const unlimited = customer.features[TestFeature.Messages].unlimited;
		const usage = customer.features[TestFeature.Messages].usage;

		expect(balance).toBe(0);
		expect(unlimited).toBe(true);
		expect(usage).toBe(1);
	});

	test("should remain unlimited after tracking with small value", async () => {
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});

		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Messages].balance;
		const unlimited = customer.features[TestFeature.Messages].unlimited;
		const usage = customer.features[TestFeature.Messages].usage;

		expect(balance).toBe(0);
		expect(unlimited).toBe(true);
		expect(usage).toBe(11); // 1 from previous test + 10
	});

	test("should remain unlimited after tracking with large value", async () => {
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1000000,
		});

		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Messages].balance;
		const unlimited = customer.features[TestFeature.Messages].unlimited;
		const usage = customer.features[TestFeature.Messages].usage;

		expect(balance).toBe(0);
		expect(unlimited).toBe(true);
		expect(usage).toBe(1000011); // 11 from previous tests + 1000000
	});

	test("should remain unlimited after multiple concurrent tracks", async () => {
		const trackPromises = Array.from({ length: 10 }, (_, i) =>
			autumnV1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: i + 1,
			}),
		);

		await Promise.all(trackPromises);

		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Messages].balance;
		const unlimited = customer.features[TestFeature.Messages].unlimited;
		const usage = customer.features[TestFeature.Messages].usage;

		// 1000011 from previous + sum(1..10) = 1000011 + 55
		expect(balance).toBe(0);
		expect(unlimited).toBe(true);
		expect(usage).toBe(1000066);
	});
});
