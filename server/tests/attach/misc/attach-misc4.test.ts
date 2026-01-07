// import { beforeAll, describe, expect, it } from "bun:test";
// import { ApiVersion } from "@autumn/shared";
// import { TestFeature } from "@tests/setup/v2Features.js";
// import ctx from "@tests/utils/testInitUtils/createTestContext.js";
// import chalk from "chalk";
// import AutumnError, { AutumnInt } from "@/external/autumn/autumnCli.js";
// import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
// import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
// import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
// import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

// const pro = constructProduct({
// 	type: "pro",
// 	items: [
// 		constructFeatureItem({
// 			featureId: TestFeature.Messages,
// 			includedUsage: 100,
// 		}),
// 	],
// });

// const premium = constructProduct({
// 	type: "premium",
// 	items: [
// 		constructFeatureItem({
// 			featureId: TestFeature.Messages,
// 			includedUsage: 300,
// 		}),
// 	],
// });

// const testCase = "attach-misc4";

// describe(`${chalk.yellowBright("attach-misc4: rate limit test")}`, () => {
// 	const customerId = testCase;
// 	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

// 	beforeAll(async () => {
// 		await initCustomerV3({
// 			ctx,
// 			customerId,
// 			withTestClock: true,
// 		});

// 		await initCustomerV3({
// 			ctx,
// 			customerId: `${customerId}-2`,
// 			withTestClock: true,
// 		});

// 		await initProductsV0({
// 			ctx,
// 			products: [pro, premium],
// 			prefix: testCase,
// 		});
// 	});

// 	it("should run 6 attaches for one customer and hit rate limit, then allow attach for second customer", async () => {
// 		const customer1Id = customerId;
// 		const customer2Id = `${customerId}-2`;

// 		// Run 6 sequential attaches for customer 1 (limit is 5 per minute)
// 		const customer1Results: PromiseSettledResult<unknown>[] = [];
// 		for (let i = 0; i < 6; i++) {
// 			try {
// 				const result = await autumnV1.attach({
// 					customer_id: customer1Id,
// 					product_id: pro.id,
// 				});
// 				customer1Results.push({ status: "fulfilled", value: result });
// 			} catch (error) {
// 				customer1Results.push({ status: "rejected", reason: error });
// 			}
// 		}

// 		// Count rate limit errors for customer 1
// 		const rateLimitErrors = customer1Results.filter(
// 			(r) =>
// 				r.status === "rejected" &&
// 				r.reason instanceof AutumnError &&
// 				r.reason.code === "rate_limit_exceeded",
// 		);

// 		// Exactly 1 should have been rate limited (6 requests with limit of 5)
// 		expect(rateLimitErrors.length).toBe(1);
// 		console.log("Customer 1: 1 out of 6 requests was rate limited");

// 		// Run attach for customer 2 - should NOT be rate limited (different customer = different rate limit key)
// 		const customer2Result = await autumnV1.attach({
// 			customer_id: customer2Id,
// 			product_id: pro.id,
// 		});

// 		// Customer 2's attach should succeed without rate limit error
// 		expect(customer2Result).toBeDefined();
// 		console.log("Customer 2: attach succeeded without rate limit");
// 	});
// });
