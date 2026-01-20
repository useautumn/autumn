import { beforeAll, describe, expect, test } from "bun:test";
import { ApiCustomerV5Schema, ApiVersion } from "@shared/index";
import { TestFeature } from "@tests/setup/v2Features";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0";

const testCase = "get-customer-v2_1_0";

const productA = constructProduct({
	id: `${testCase}-product-a`,
	type: "free",
	isDefault: false,
	version: 1,
	items: [
		constructPrepaidItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
			price: 10,
			billingUnits: 100,
		}),
	],
});

describe(`${chalk.yellowBright("get-customer-v2.1.0: Testing get customer endpoint")}`, () => {
	const autumnV2_1_0 = new AutumnInt({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V2_1,
	});
	const autumnV2_0 = new AutumnInt({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V2_0,
	});

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [productA],
			prefix: "",
			customerId: `${testCase}-customer`,
		});

		await initCustomerV3({
			ctx,
			customerId: `${testCase}-customer`,
			attachPm: "success",
		});

		await autumnV2_1_0.attach({
			customer_id: `${testCase}-customer`,
			product_id: productA.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 100,
				},
			],
		});
	});

	test("should get customer", async () => {
		const customer = await autumnV2_1_0.customers.get(`${testCase}-customer`);
		const customerV2_0 = await autumnV2_0.customers.get(`${testCase}-customer`);
		expect(customer).toBeDefined();
		console.log(JSON.stringify(customer, null, 4));
		console.log("--------------------------------");
		console.log(JSON.stringify(customerV2_0, null, 4));

		try {
			ApiCustomerV5Schema.parse(customer);
		} catch (error) {
			console.error(error);
		}
	});
});
