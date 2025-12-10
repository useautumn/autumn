import { beforeAll, describe } from "bun:test";
import { ApiVersion, FreeTrialDuration } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructFeatureItem } from "../../src/utils/scriptUtils/constructItem.js";
import { initProductsV0 } from "../../src/utils/scriptUtils/testUtils/initProductsV0.js";

const pro = constructProduct({
	type: "pro",
	forcePaidDefault: true,

	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 1000,
		}),
	],
	freeTrial: {
		card_required: false,
		duration: FreeTrialDuration.Day,
		length: 7,
		unique_fingerprint: false,
	},
});

const premium = constructProduct({
	type: "premium",
	isDefault: false,

	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 1000,
		}),
	],
	freeTrial: {
		card_required: true,
		duration: FreeTrialDuration.Day,
		length: 7,
		unique_fingerprint: false,
	},
});

console.log("Pro is default", pro.is_default);

describe(`${chalk.yellowBright("temp: Testing entity prorated")}`, () => {
	const customerId = "temp";
	const autumn: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [pro, premium],
			prefix: customerId,
			customerId,
		});

		// await initCustomerV3({
		// 	ctx,
		// 	customerId,
		// 	customerData: {},
		// 	attachPm: "success",
		// 	withTestClock: true,
		// });
		await autumn.customers.create({
			id: customerId,
			name: customerId,
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
