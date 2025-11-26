import { beforeAll, describe, test } from "bun:test";
import { LegacyVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	constructArrearItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "../../src/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "../../src/utils/scriptUtils/testUtils/initProductsV0.js";
import { replaceItems } from "../attach/utils.js";

// UNCOMMENT FROM HERE
const pro = constructProduct({
	type: "pro",
	isDefault: true,

	items: [
		constructArrearItem({
			featureId: TestFeature.Credits,
			includedUsage: 0,
			billingUnits: 1,
			price: 0.5,
		}),
	],
});

// const oneOff = constructRawProduct({
// 	id: "pro-prepaid",
// 	items: [
// 		constructPrepaidItem({
// 			featureId: TestFeature.Credits,
// 			includedUsage: 0,
// 			billingUnits: 1,
// 			price: 0.5,
// 		}),
// 	],
// });

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
			products: [pro],
			prefix: customerId,
		});
	});

	test("should attach pro product", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		const newItems = replaceItems({
			items: pro.items,
			featureId: TestFeature.Credits,
			newItem: constructPrepaidItem({
				featureId: TestFeature.Credits,
				includedUsage: 0,
				billingUnits: 1,
				price: 0.5,
			}),
		});

		await autumn.products.update(pro.id, {
			items: newItems,
		});
	});
});
