import { beforeAll, describe, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "../../src/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "../../src/utils/scriptUtils/testUtils/initProductsV0.js";
import { replaceItems } from "../attach/utils.js";

// UNCOMMENT FROM HERE
const pro = constructProduct({
	type: "one_off",
	isDefault: false,
	isAddOn: true,

	items: [
		constructPrepaidItem({
			featureId: TestFeature.Credits,
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		}),
		// constructArrearProratedItem({
		// 	featureId: TestFeature.Users,
		// 	pricePerUnit: 40,
		// 	includedUsage: 0,
		// }),
	],
});

describe(`${chalk.yellowBright("temp: Testing prepaid and prorated")}`, () => {
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
	});

	test("should create a subscription with prepaid and prorated", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
			options: [
				{
					feature_id: TestFeature.Credits,
					quantity: 200,
				},
			],
		});

		const newItems = replaceItems({
			featureId: TestFeature.Credits,
			newItem: constructPrepaidItem({
				featureId: TestFeature.Credits,
				includedUsage: 0,
				billingUnits: 80,
				price: 10,
			}),
			items: pro.items,
		});

		await autumn.products.update(pro.id, {
			items: newItems,
		});
	});
});
