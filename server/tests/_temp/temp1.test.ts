import { beforeAll, describe, test } from "bun:test";
import { BillingInterval, LegacyVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils.js";
import {
	constructArrearItem,
	constructFeatureItem,
} from "@/utils/scriptUtils/constructItem.js";
import {
	constructProduct,
	constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "../../src/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "../../src/utils/scriptUtils/testUtils/initProductsV0.js";
import { replaceItems } from "../utils/testProductUtils/testProductUtils.js";

// UNCOMMENT FROM HERE
const pro = constructProduct({
	type: "pro",

	items: [
		// constructArrearItem({
		// 	featureId: TestFeature.Words,
		// 	includedUsage: 0,
		// 	price: 0.2,
		// }),
		constructFeatureItem({
			featureId: TestFeature.Users,
			includedUsage: 5,
		}),
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
	],
});

const basic = constructRawProduct({
	id: "basic",

	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
		constructPriceItem({
			price: 10,
			interval: BillingInterval.Month,
		}),
	],
});

describe(`${chalk.yellowBright("temp: Testing add ons")}`, () => {
	const customerId = "temp";
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	let testClockId: string;
	beforeAll(async () => {
		const result = await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		await initProductsV0({
			ctx,
			products: [pro, basic],
			prefix: customerId,
		});

		// testClockId = result.testClockId!;

		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		// await autumn.attach({
		// 	customer_id: customerId,
		// 	product_id: basic.id,
		// });
	});
	return;

	test("should attach pro product", async () => {
		// newPro = structuredClone(pro);
		let newItems = replaceItems({
			items: pro.items,
			interval: BillingInterval.Month,
			newItem: constructPriceItem({
				price: 100,
				interval: BillingInterval.Month,
			}),
		});

		newItems = replaceItems({
			items: newItems,
			featureId: TestFeature.Words,
			newItem: constructArrearItem({
				featureId: TestFeature.Words,
				price: 0.5,
			}),
		});

		await autumn.products.update(pro.id, {
			items: newItems,
		});
	});
});
