// import { beforeAll, describe, test } from "bun:test";
// import { ApiVersion } from "@autumn/shared";
// import { TestFeature } from "@tests/setup/v2Features.js";
// import ctx from "@tests/utils/testInitUtils/createTestContext.js";
// import chalk from "chalk";
// import { AutumnInt } from "@/external/autumn/autumnCli.js";
// import {
// 	constructArrearProratedItem,
// 	constructFeatureItem,
// } from "@/utils/scriptUtils/constructItem.js";
// import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
// import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
// import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

// const premiumProd = constructProduct({
// 	type: "premium",
// 	isDefault: false,
// 	items: [
// 		constructFeatureItem({
// 			featureId: TestFeature.Messages,
// 			includedUsage: 300,
// 		}),

// 		constructArrearProratedItem({
// 			featureId: TestFeature.Users,
// 			includedUsage: 1,
// 			pricePerUnit: 10,
// 		}),
// 	],
// });

// const testCase = "temp";

// describe(`${chalk.yellowBright("balances-update4: update balance for paid allocated")}`, () => {
// 	const customerId = "balances-update4";
// 	const autumnV0: AutumnInt = new AutumnInt({ version: ApiVersion.V0_2 });
// 	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

// 	beforeAll(async () => {
// 		await initCustomerV3({
// 			ctx,
// 			customerId,
// 			withTestClock: false,
// 			attachPm: "success",
// 		});

// 		await initProductsV0({
// 			ctx,
// 			products: [premiumProd],
// 			prefix: testCase,
// 		});

// 		await autumnV1.attach({
// 			customer_id: customerId,
// 			product_id: premiumProd.id,
// 		});
// 	});

// 	test("should have correct v1 response", async () => {
// 		// await autumnV1.balances.update({
// 		// 	customer_id: customerId,
// 		// 	feature_id: TestFeature.Users,
// 		// 	current_balance: 4
// 		// });
// 	});

// 	// await autumnV1.track({
// 	//   customer_id: customerId,
// 	//   feature_id: TestFeature.Users,
// 	//   value: -2,
// 	// });
// 	// await autumnV1.track({
// 	//   customer_id: customerId,
// 	//   feature_id: TestFeature.Users,
// 	//   value: -1,
// 	// });
// });
