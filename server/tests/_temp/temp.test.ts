import { beforeAll, describe } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { replaceItems } from "@tests/utils/testProductUtils/testProductUtils";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	constructFeatureItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";
import {
	constructProduct,
	constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const pro = constructProduct({
	type: "pro",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 500,
		}),
	],
});

const oneOffCredits = constructRawProduct({
	id: "one_off_credits",
	isAddOn: true,
	items: [
		constructPrepaidItem({
			featureId: TestFeature.Credits,
			billingUnits: 100,
			price: 10,
			isOneOff: true,
		}),
	],
});

const testCase = "temp";

describe(`${chalk.yellowBright("temp: temporary script for testing")}`, () => {
	const customerId = "temp";
	const autumnV0: AutumnInt = new AutumnInt({ version: ApiVersion.V0_2 });
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [oneOffCredits, pro],
			prefix: testCase,
			customerId,
		});

		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
			attachPm: "success",
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: oneOffCredits.id,
			options: [
				{
					feature_id: TestFeature.Credits,
					quantity: 100,
				},
			],
		});
		await autumnV1.attach({
			customer_id: customerId,
			product_id: oneOffCredits.id,
			is_custom: true,
			items: replaceItems({
				items: oneOffCredits.items,
				featureId: TestFeature.Credits,
				newItem: constructFeatureItem({
					featureId: TestFeature.Credits,
					includedUsage: 100,
				}),
			}),
			// options: [
			// 	{
			// 		feature_id: TestFeature.Credits,
			// 		quantity: 100,
			// 	},
			// ],
		});
	});
});
