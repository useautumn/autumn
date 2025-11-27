import { beforeAll, describe, test } from "bun:test";
import { LegacyVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "../../src/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "../../src/utils/scriptUtils/testUtils/initProductsV0.js";

// UNCOMMENT FROM HERE
const pro = constructProduct({
	type: "pro",
	isDefault: true,

	items: [
		// constructArrearItem({
		// 	featureId: TestFeature.Credits,
		// 	includedUsage: 0,
		// 	billingUnits: 1,
		// 	price: 0.5,
		// }),
	],
});

const premium = constructProduct({
	type: "premium",
	isDefault: false,
	isAddOn: true,
	items: [
		constructFeatureItem({
			featureId: TestFeature.Credits,
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
			products: [pro, premium],
			prefix: customerId,
		});
	});

	test("should attach pro product", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});
	});
});

// stripe subscriptions create \
//   --customer=cus_123456789 \
//   --items[0][price]=price_123456789 \
//   --collection_method=send_invoice \
//   --days_until_due=30 \
//   --payment_settings[payment_method_types][0]=us_bank_account
