import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import chalk from "chalk";
import { TestFeature } from "tests/setup/v2Features.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	constructArrearItem,
	constructFeatureItem,
} from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { trackWasSuccessful } from "../trackTestUtils.js";

const testCase = "trackBasic8";
const prepaidCustomerId = `${testCase}_prepaid`;
const payPerUseCustomerId = `${testCase}_payperuse`;

// Prepaid feature: 5 included, no overage allowed
const prepaidItem = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 5,
});

// PayPerUse feature: 5 included, overage allowed at $0.01 per unit, usage_limit of 10
const payPerUseItem = constructArrearItem({
	featureId: TestFeature.Messages,
	includedUsage: 5,
	price: 0.01,
	billingUnits: 1,
	usageLimit: 10,
});

const prepaidProduct = constructProduct({
	id: "prepaid",
	items: [prepaidItem],
	type: "pro",
});

const payPerUseProduct = constructProduct({
	id: "payperuse",
	items: [payPerUseItem],
	type: "pro",
});

describe(`${chalk.yellowBright(`${testCase}: Testing prepaid vs pay-per-use overage behavior`)}`, () => {
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		// Initialize both customers
		await initCustomerV3({
			ctx,
			customerId: prepaidCustomerId,
			withTestClock: false,
			attachPm: "success",
		});

		await initCustomerV3({
			ctx,
			customerId: payPerUseCustomerId,
			withTestClock: false,
			attachPm: "success",
		});

		// Initialize products
		await initProductsV0({
			ctx,
			products: [prepaidProduct, payPerUseProduct],
			prefix: testCase,
		});

		// Attach prepaid product to prepaid customer
		await autumnV1.attach({
			customer_id: prepaidCustomerId,
			product_id: prepaidProduct.id,
		});

		// Attach payPerUse product to payPerUse customer
		await autumnV1.attach({
			customer_id: payPerUseCustomerId,
			product_id: payPerUseProduct.id,
		});
	});

	test("should have initial balance of 5 for prepaid customer", async () => {
		const customer = await autumnV1.customers.get(prepaidCustomerId);
		const balance = customer.features[TestFeature.Messages].balance;

		expect(balance).toBe(5);
	});

	test("should have initial balance of 5 for pay-per-use customer", async () => {
		const customer = await autumnV1.customers.get(payPerUseCustomerId);
		const balance = customer.features[TestFeature.Messages].balance;

		expect(balance).toBe(5);
	});

	test("should reject tracking 7 units when prepaid balance is 5 (no overage)", async () => {
		const res = await autumnV1.track({
			customer_id: prepaidCustomerId,
			feature_id: TestFeature.Messages,
			value: 7,
			overage_behaviour: "reject",
		});

		expect(trackWasSuccessful({ res })).toBe(false);
		expect(res.code).toBe("insufficient_balance");

		// Verify balance remains unchanged
		const finalCustomer = await autumnV1.customers.get(prepaidCustomerId);
		const finalBalance = finalCustomer.features[TestFeature.Messages].balance;

		expect(finalBalance).toBe(5);
	});

	test("should allow tracking 7 units when PayPerUse balance is 5 (overage allowed)", async () => {
		const res = await autumnV1.track({
			customer_id: payPerUseCustomerId,
			feature_id: TestFeature.Messages,
			value: 7,
			overage_behaviour: "reject",
		});

		expect(trackWasSuccessful({ res })).toBe(true);

		// Verify balance went negative (overage)
		const finalCustomer = await autumnV1.customers.get(payPerUseCustomerId);
		const finalBalance = finalCustomer.features[TestFeature.Messages].balance;
		const finalUsage = finalCustomer.features[TestFeature.Messages].usage;

		expect(finalBalance).toBe(-2);
		expect(finalUsage).toBe(7);
	});
});
