import { beforeAll, describe, test } from "bun:test";
import { LegacyVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import {
	constructProduct,
	constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts.js";
import { constructPriceItem } from "../../src/internal/products/product-items/productItemUtils.js";
import { initCustomerV3 } from "../../src/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "../../src/utils/scriptUtils/testUtils/initProductsV0.js";

// UNCOMMENT FROM HERE
const pro = constructProduct({
	type: "pro",
	isDefault: true,

	items: [
		constructFeatureItem({
			featureId: TestFeature.Credits,
			includedUsage: 200,
			// unlimited: true,
		}),
	],
});

const oneOff = constructRawProduct({
	id: "one-off",
	items: [
		constructPriceItem({
			price: 10,
			interval: null,
		}),
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
	],
});

describe(`${chalk.yellowBright("temp: Testing add ons")}`, () => {
	const customerId = "temp";
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

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
			products: [pro, oneOff],
			prefix: customerId,
		});
	});

	test("should attach pro product", async () => {
		// await autumn.customers.get(customerId);

		const res = await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: oneOff.id,
		});
		await autumn.attach({
			customer_id: customerId,
			product_id: oneOff.id,
		});
		const customer = await autumn.customers.get(customerId);
		console.log("Customer:", customer);

		// await autumn.attach({
		// 	customer_id: customerId,
		// 	product_id: oneOff.id,
		// });
		// await autumn.attach({
		// 	customer_id: customerId,
		// 	product_id: oneOff.id,
		// });

		// const customer = await autumn.customers.get(customerId);
		// console.log("Customer:", customer);
	});
});
