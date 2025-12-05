import { beforeAll, describe, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	constructProduct,
	constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts.js";
import { constructPriceItem } from "../../src/internal/products/product-items/productItemUtils.js";
import {
	constructFeatureItem,
	constructPrepaidItem,
} from "../../src/utils/scriptUtils/constructItem.js";
import { initCustomerV3 } from "../../src/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "../../src/utils/scriptUtils/testUtils/initProductsV0.js";
import { replaceItems } from "../attach/utils.js";

// UNCOMMENT FROM HERE
const oneOff = constructRawProduct({
	id: "one_off",
	items: [
		constructPrepaidItem({
			isOneOff: true,
			featureId: TestFeature.Messages,
			billingUnits: 1,
			price: 1,
		}),
	],
});
const oneOff2 = constructRawProduct({
	id: "one_off2",
	items: [
		constructPriceItem({
			price: 10,
			interval: null,
		}),
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 20,
			interval: null,
		}),
	],
});

const pro = constructProduct({
	type: "pro",
	isDefault: false,

	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
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
			products: [pro, oneOff, oneOff2],
			prefix: customerId,
		});
	});
	return;

	test("should create a subscription with prepaid and prorated", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: oneOff2.id,
		});

		await autumn.products.update(oneOff2.id, {
			items: replaceItems({
				items: oneOff2.items,
				featureId: TestFeature.Messages,
				newItem: constructFeatureItem({
					featureId: TestFeature.Messages,
					includedUsage: 30,
				}),
			}),
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: oneOff2.id,
		});
	});
});
