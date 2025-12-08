import { beforeAll, describe } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { attachAuthenticatePaymentMethod } from "../../src/external/stripe/stripeCusUtils.js";
import { constructFeatureItem } from "../../src/utils/scriptUtils/constructItem.js";
import { initCustomerV3 } from "../../src/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "../../src/utils/scriptUtils/testUtils/initProductsV0.js";

const pro = constructProduct({
	type: "pro",
	isDefault: false,

	items: [
		constructFeatureItem({
			featureId: TestFeature.Credits,
			includedUsage: 1000,
		}),
	],
});

describe(`${chalk.yellowBright("temp: Testing entity prorated")}`, () => {
	const customerId = "temp";
	const autumn: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		await initProductsV0({
			ctx,
			products: [pro],
			prefix: customerId,
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		await attachAuthenticatePaymentMethod({
			ctx,
			customerId,
		});
	});

	// test("should create a subscription with prepaid and prorated", async () => {
	// 	await autumn.attach({
	// 		customer_id: customerId,
	// 		product_id: oneOff2.id,
	// 	});

	// 	await autumn.products.update(oneOff2.id, {
	// 		items: replaceItems({
	// 			items: oneOff2.items,
	// 			featureId: TestFeature.Messages,
	// 			newItem: constructFeatureItem({
	// 				featureId: TestFeature.Messages,
	// 				includedUsage: 30,
	// 			}),
	// 		}),
	// 	});

	// 	await autumn.attach({
	// 		customer_id: customerId,
	// 		product_id: oneOff2.id,
	// 	});
	// });
});
