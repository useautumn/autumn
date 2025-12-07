import { beforeAll, describe } from "bun:test";
import {
	ApiVersion,
	ProductItemInterval,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	constructProduct,
	constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts.js";
import { constructFeatureItem } from "../../src/utils/scriptUtils/constructItem.js";
import { initCustomerV3 } from "../../src/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "../../src/utils/scriptUtils/testUtils/initProductsV0.js";

// UNCOMMENT FROM HERE
const free = constructRawProduct({
	id: "free",
	group: "free_group",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
			interval: null,
		}),
	],
});

const pro = constructProduct({
	type: "pro",
	isDefault: false,
	group: "main",

	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 1000,
			interval: ProductItemInterval.Month,
			rolloverConfig: {
				max: null,
				length: 1,
				duration: RolloverExpiryDurationType.Forever,
			},
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
			products: [pro, free],
			prefix: customerId,
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: free.id,
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
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
