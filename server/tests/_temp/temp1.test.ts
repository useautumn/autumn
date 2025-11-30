import { beforeAll, describe, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructFeatureItem } from "../../src/utils/scriptUtils/constructItem.js";
import { initCustomerV3 } from "../../src/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "../../src/utils/scriptUtils/testUtils/initProductsV0.js";
import { replaceItems } from "../attach/utils.js";

// UNCOMMENT FROM HERE
const pro = constructProduct({
	type: "pro",
	isDefault: false,

	items: [
		constructFeatureItem({
			featureId: TestFeature.Users,
			includedUsage: 5,
		}),
	],
});
const premium = constructProduct({
	type: "premium",
	isDefault: false,

	items: [
		constructFeatureItem({
			featureId: TestFeature.Users,
			includedUsage: 10,
		}),
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
			products: [pro, premium],
			prefix: customerId,
		});
	});

	test("should create a subscription with prepaid and prorated", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: premium.id,
		});
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		// Create new version of pro
		await autumn.products.update(pro.id, {
			items: replaceItems({
				featureId: TestFeature.Users,
				newItem: constructFeatureItem({
					featureId: TestFeature.Users,
					includedUsage: 2,
				}),
				items: pro.items,
			}),
		});
	});
});
