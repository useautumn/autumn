// import { beforeAll, describe, expect, test } from "bun:test";
// import { ApiVersion } from "@autumn/shared";
// import chalk from "chalk";
// import { TestFeature } from "tests/setup/v2Features.js";
// import { timeout } from "tests/utils/genUtils.js";
// import ctx from "tests/utils/testInitUtils/createTestContext.js";
// import { AutumnInt } from "@/external/autumn/autumnCli.js";
// import { deleteCachedApiCustomer } from "@/internal/customers/cusUtils/apiCusCacheUtils/deleteCachedApiCustomer.js";
// import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
// import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
// import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
// import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

// const messagesFeature = constructFeatureItem({
// 	featureId: TestFeature.Messages,
// 	includedUsage: 100,
// });

// const freeProd = constructProduct({
// 	type: "free",
// 	isDefault: false,
// 	items: [messagesFeature],
// });

// const testCase = "race-condition1";

// describe(`${chalk.yellowBright("race-condition1: track + immediate cache deletion race condition")}`, () => {
// 	const customerId = "race-condition1";
// 	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

// 	beforeAll(async () => {
// 		await initCustomerV3({
// 			ctx,
// 			customerId,
// 			withTestClock: false,
// 		});

// 		await initProductsV0({
// 			ctx,
// 			products: [freeProd],
// 			prefix: testCase,
// 		});

// 		await autumnV1.attach({
// 			customer_id: customerId,
// 			product_id: freeProd.id,
// 		});
// 	});

// 	test("should have initial balance of 100", async () => {
// 		const customer = await autumnV1.customers.get(customerId);
// 		const balance = customer.features[TestFeature.Messages].balance;

// 		expect(balance).toBe(100);
// 	});

// 	test("should handle race condition: track + immediate cache deletion", async () => {
// 		// Scenario: Track writes to Redis, then cache is immediately deleted
// 		// This simulates what happens when refreshCacheMiddleware triggers during a track sync

// 		// Step 1: Track (writes to Redis + queues sync)
// 		const trackPromise = autumnV1.track({
// 			customer_id: customerId,
// 			feature_id: TestFeature.Messages,
// 			value: 5,
// 		});

// 		// const trackPromise = async () => {
// 		// 	// 1. Run redis deduction
// 		// 	await runRedisDeduction({
// 		// 		ctx: ctx as unknown as AutumnContext,
// 		// 		customerId,
// 		// 		featureDeductions: [
// 		// 			{
// 		// 				feature: {
// 		// 					id: TestFeature.Messages,
// 		// 					...messagesFeature,
// 		// 				},
// 		// 				deduction: 5,
// 		// 			},
// 		// 		],
// 		// 		overageBehavior: "cap",
// 		// 	});

// 		// 	// 2. Sync
// 		// 	await syncItem({
// 		// 		item: {
// 		// 			customerId,
// 		// 			featureId: TestFeature.Messages,
// 		// 			orgId: ctx.org.id,
// 		// 			env: ctx.env,
// 		// 			timestamp: Date.now(),
// 		// 		},
// 		// 		ctx: ctx as unknown as AutumnContext,
// 		// 	});
// 		// };

// 		// Step 2: Immediately delete cache (simulating concurrent middleware action)
// 		// Don't await yet to create race condition
// 		// const deletePromise = deleteCachedApiCustomer({
// 		// 	customerId,
// 		// 	orgId: ctx.org.id,
// 		// 	env: ctx.env,
// 		// });

// 		// Wait for both to complete
// 		await Promise.all([trackPromise]);

// 		// Step 3: Verify immediate state from cache (cache was deleted, so this will be a cache miss and rebuild)
// 		const customerAfterDelete = await autumnV1.customers.get(customerId);
// 		const balanceAfterDelete =
// 			customerAfterDelete.features[TestFeature.Messages].balance;

// 		// Balance might be 95 (if cache rebuilt from DB after sync) or 100 (if sync hasn't completed yet)
// 		// Either is acceptable as long as it's not corrupted
// 		expect(balanceAfterDelete).toBeGreaterThanOrEqual(95);
// 		expect(balanceAfterDelete).toBeLessThanOrEqual(100);

// 		console.log(`Balance after delete: ${balanceAfterDelete}`);
// 		return;

// 		// Step 4: Wait for sync to complete (2 seconds)
// 		await timeout(2000);

// 		// Step 5: Verify final state with skip_cache to check DB directly
// 		const finalCustomer = await autumnV1.customers.get(customerId, {
// 			skip_cache: "true",
// 		});
// 		const finalBalance = finalCustomer.features[TestFeature.Messages].balance;
// 		const finalUsage = finalCustomer.features[TestFeature.Messages].usage;

// 		// After sync completes, DB should reflect the deduction
// 		expect(finalBalance).toBe(95);
// 		expect(finalUsage).toBe(5);
// 	});
// 	return;

// 	test("should handle multiple concurrent tracks with cache deletions", async () => {
// 		// Scenario: Multiple tracks happening concurrently with cache deletions
// 		// This simulates high load with cache churn

// 		const operations = [];

// 		// Track 1
// 		operations.push(
// 			autumnV1.track({
// 				customer_id: customerId,
// 				feature_id: TestFeature.Messages,
// 				value: 2,
// 			}),
// 		);

// 		// Delete cache immediately after first track
// 		operations.push(
// 			deleteCachedApiCustomer({
// 				customerId,
// 				orgId: ctx.org.id,
// 				env: "test",
// 			}),
// 		);

// 		// Track 2 (might hit empty cache)
// 		operations.push(
// 			autumnV1.track({
// 				customer_id: customerId,
// 				feature_id: TestFeature.Messages,
// 				value: 3,
// 			}),
// 		);

// 		// Delete cache again
// 		operations.push(
// 			deleteCachedApiCustomer({
// 				customerId,
// 				orgId: ctx.org.id,
// 				env: "test",
// 			}),
// 		);

// 		// Wait for all operations to complete
// 		await Promise.all(operations);

// 		// Wait for sync to complete
// 		await timeout(2000);

// 		// Verify final state - should have deducted 5 total (2 + 3)
// 		const finalCustomer = await autumnV1.customers.get(customerId, {
// 			skip_cache: "true",
// 		});
// 		const finalBalance = finalCustomer.features[TestFeature.Messages].balance;
// 		const finalUsage = finalCustomer.features[TestFeature.Messages].usage;

// 		expect(finalBalance).toBe(90);
// 		expect(finalUsage).toBe(10);
// 	});

// 	test("should handle cache deletion during sync window", async () => {
// 		// Scenario: Track completes, then cache is deleted while sync is in progress
// 		// This is the most likely race condition scenario

// 		// Step 1: Track and wait a bit for it to write to Redis
// 		await autumnV1.track({
// 			customer_id: customerId,
// 			feature_id: TestFeature.Messages,
// 			value: 10,
// 		});

// 		// Step 2: Wait 500ms (sync is likely in progress but not complete)
// 		await timeout(500);

// 		// Step 3: Delete cache during sync window
// 		await deleteCachedApiCustomer({
// 			customerId,
// 			orgId: ctx.org.id,
// 			env: "test",
// 		});

// 		// Step 4: Try to get customer immediately (cache is empty, will rebuild from DB)
// 		const customerDuringSync = await autumnV1.customers.get(customerId);
// 		const balanceDuringSync =
// 			customerDuringSync.features[TestFeature.Messages].balance;

// 		// Balance might not reflect the latest deduction yet if sync isn't complete
// 		// But it should be a valid state
// 		expect(balanceDuringSync).toBeGreaterThanOrEqual(80);
// 		expect(balanceDuringSync).toBeLessThanOrEqual(90);

// 		// Step 5: Wait for sync to definitely complete
// 		await timeout(2000);

// 		// Step 6: Verify final state
// 		const finalCustomer = await autumnV1.customers.get(customerId, {
// 			skip_cache: "true",
// 		});
// 		const finalBalance = finalCustomer.features[TestFeature.Messages].balance;
// 		const finalUsage = finalCustomer.features[TestFeature.Messages].usage;

// 		expect(finalBalance).toBe(80);
// 		expect(finalUsage).toBe(20);
// 	});
// });
