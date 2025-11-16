import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type TrackResponseV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { timeout } from "@tests/utils/genUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "track-basic9";
const customerId = testCase;

// PayPerUse feature: 5 included, overage allowed at $0.01 per unit, usage_limit of 10
const payPerUseItem = constructArrearItem({
	featureId: TestFeature.Messages,
	includedUsage: 5,
	price: 0.01,
	billingUnits: 1,
	usageLimit: 10,
});

const payPerUseProduct = constructProduct({
	id: "payperuse",
	items: [payPerUseItem],
	type: "pro",
});

describe(`${chalk.yellowBright(`${testCase}: Testing pay-per-use (overage allowed) with reject behavior`)}`, () => {
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
			products: [payPerUseProduct],
			prefix: testCase,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: payPerUseProduct.id,
		});
	});

	test("should have initial balance of 5", async () => {
		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Messages].balance;

		expect(balance).toBe(5);
	});

	test("should allow tracking 7 units when balance is 5 (overage allowed)", async () => {
		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 7,
			overage_behavior: "reject",
		});

		// Verify track response
		expect(trackRes.balance).toMatchObject({
			granted_balance: 5,
			purchased_balance: 2,
			current_balance: 0,
			usage: 7,
		});

		// Verify balance went negative (overage)
		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Messages].balance;
		const usage = customer.features[TestFeature.Messages].usage;

		expect(balance).toBe(-2);
		expect(usage).toBe(7);
	});

	// Track 3 more units, should be allowed
	test("should allow tracking 3 units when balance is -2 (overage allowed)", async () => {
		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 3,
			overage_behavior: "reject",
		});

		// Verify track response
		expect(trackRes.balance).toMatchObject({
			granted_balance: 5,
			purchased_balance: 5,
			current_balance: 0,
			usage: 10,
		});

		// Verify balance went negative (overage)
		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Messages].balance;
		const usage = customer.features[TestFeature.Messages].usage;

		expect(balance).toBe(-5);
		expect(usage).toBe(10);
	});

	test("should reflect overage balance in non-cached customer after 2s", async () => {
		// Wait 2 seconds for DB sync
		await timeout(5000);

		// Fetch customer with skip_cache=true
		const customer = await autumnV1.customers.get(customerId, {
			skip_cache: "true",
		});
		const balance = customer.features[TestFeature.Messages].balance;
		const usage = customer.features[TestFeature.Messages].usage;

		expect(balance).toBe(-5);
		expect(usage).toBe(10);
	});
});
