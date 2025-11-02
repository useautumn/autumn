// import { beforeAll, describe, expect, test } from "bun:test";
// import { ApiVersion, ProductItemFeatureType } from "@autumn/shared";
// import chalk from "chalk";
// import { TestFeature } from "tests/setup/v2Features.js";
// import ctx from "tests/utils/testInitUtils/createTestContext.js";
// import { AutumnInt } from "@/external/autumn/autumnCli.js";
// import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
// import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
// import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
// import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

// const testCase = "trackMisc3";
// const customerId = `${testCase}_cus1`;

// const userItem = constructFeatureItem({
// 	featureId: TestFeature.Users,
// 	includedUsage: 1,
// 	featureType: ProductItemFeatureType.ContinuousUse,
// });

// const pro = constructProduct({
// 	items: [userItem],
// 	type: "pro",
// });

// describe(`${chalk.yellowBright(`${testCase}: Testing track prepaid allocated feature with concurrent requests`)}`, () => {
// 	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

// 	beforeAll(async () => {
// 		await initCustomerV3({
// 			ctx,
// 			customerId,
// 			withTestClock: false,
// 		});

// 		await initProductsV0({
// 			ctx,
// 			products: [pro],
// 			prefix: testCase,
// 		});

// 		// Attach product to customer
// 		await autumnV1.attach({
// 			customer_id: customerId,
// 			product_id: pro.id,
// 		});
// 	});

// 	test("should have initial balance of 1", async () => {
// 		const customer = await autumnV1.customers.get(customerId);
// 		const balance = customer.features[TestFeature.Users].balance;

// 		expect(balance).toBe(1);
// 	});

// 	test("should only allow one concurrent seat allocation with 1 included seat and create no duplicate invoices", async () => {
// 		const customer = await autumnV1.customers.get(customerId);

// 		const initialInvoices = await ctx.stripeCli.invoices.list({
// 			customer: customer.stripe_id as string,
// 		});
// 		const initialInvoiceCount = initialInvoices.data.length;

// 		// Try to allocate 5 different seats concurrently - only 1 should succeed (the included seat)
// 		// The other 4 should be rejected because we only have 1 included seat
// 		const promises = [
// 			autumnV1.track({
// 				customer_id: customerId,
// 				feature_id: TestFeature.Users,
// 				value: 1,
// 			}),
// 			autumnV1.track({
// 				customer_id: customerId,
// 				feature_id: TestFeature.Users,
// 				value: 1,
// 			}),
// 			autumnV1.track({
// 				customer_id: customerId,
// 				feature_id: TestFeature.Users,
// 				value: 1,
// 			}),
// 			autumnV1.track({
// 				customer_id: customerId,
// 				feature_id: TestFeature.Users,
// 				value: 1,
// 			}),
// 			autumnV1.track({
// 				customer_id: customerId,
// 				feature_id: TestFeature.Users,
// 				value: 1,
// 			}),
// 		];

// 		const results = await Promise.allSettled(promises);

// 		const successCount = results.filter((r) => r.status === "fulfilled").length;
// 		const rejectedCount = results.filter((r) => r.status === "rejected").length;

// 		// Only 1 should succeed (included seat), 4 should be rejected
// 		expect(successCount).toBe(1);
// 		expect(rejectedCount).toBe(4);

// 		// Check final balance
// 		const finalCustomer = await autumnV1.customers.get(customerId);
// 		const finalBalance = finalCustomer.features[TestFeature.Users].balance;

// 		expect(finalBalance).toBe(0);

// 		// Verify no duplicate invoices were created
// 		// Since we only allocated the 1 included seat, no overage charges should occur
// 		const finalInvoices = await ctx.stripeCli.invoices.list({
// 			customer: customer.stripe_id as string,
// 		});
// 		const finalInvoiceCount = finalInvoices.data.length;
// 		const newInvoicesCreated = finalInvoiceCount - initialInvoiceCount;

// 		expect(newInvoicesCreated).toBe(0);
// 	});
// });
