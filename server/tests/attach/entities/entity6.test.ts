// import { beforeAll, describe, expect } from "bun:test";
// import {
// 	ApiVersion,
// 	CusProductStatus,
// 	FreeTrialDuration,
// } from "@autumn/shared";
// import { TestFeature } from "@tests/setup/v2Features.js";
// import ctx from "@tests/utils/testInitUtils/createTestContext.js";
// import chalk from "chalk";
// import { AutumnInt } from "@/external/autumn/autumnCli.js";
// import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
// import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
// import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3";
// import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

// const pro = constructProduct({
// 	type: "pro",
// 	freeTrial: {
// 		length: 7,
// 		duration: FreeTrialDuration.Day,
// 		unique_fingerprint: true,
// 		card_required: false,
// 	},
// 	items: [
// 		constructFeatureItem({
// 			featureId: TestFeature.Messages,
// 			includedUsage: 300,
// 			entityFeatureId: TestFeature.Users,
// 		}),
// 	],
// });

// const testCase = "entity6";

// describe(`${chalk.yellowBright("entity6: Testing two entities with a free trial")}`, () => {
// 	const customerId = testCase;

// 	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

// 	beforeAll(async () => {
// 		await initCustomerV3({
// 			ctx,
// 			customerId,
// 			withTestClock: true,
// 			attachPm: "success",
// 		});

// 		await autumnV1.entities.create(customerId, [
// 			{
// 				id: "entity1",
// 				name: "Entity 1",
// 				feature_id: TestFeature.Users,
// 			},
// 			{
// 				id: "entity2",
// 				name: "Entity 2",
// 				feature_id: TestFeature.Users,
// 			},
// 		]);

// 		await initProductsV0({
// 			ctx,
// 			products: [pro],
// 			prefix: testCase,
// 		});

// 		await autumnV1.attach({
// 			customer_id: customerId,
// 			product_id: pro.id,
// 			entity_id: "entity1",
// 		});

// 		const entity1 = await autumnV1.entities.get(customerId, "entity1");

// 		await autumnV1.attach({
// 			customer_id: customerId,
// 			product_id: pro.id,
// 			entity_id: "entity2",
// 		});

// 		const entity2 = await autumnV1.entities.get(customerId, "entity2");

// 		expect(entity1.products.length).toBe(1);
// 		expect(entity2.products.length).toBe(1);
// 		expect(entity1.products[0].id).toBe(pro.id);
// 		expect(entity2.products[0].id).toBe(pro.id);
// 		expect(entity1.products[0].status).toBe(CusProductStatus.Trialing);
// 		expect(entity2.products[0].status).toBe(CusProductStatus.Trialing);
// 	});
// });
