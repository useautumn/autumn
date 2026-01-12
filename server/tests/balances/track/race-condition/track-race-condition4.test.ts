import { beforeAll, describe, expect, test } from "bun:test";
import { type ApiCustomer, ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { currentRegion } from "@/external/redis/initRedis.js";
import { executeRedisDeduction } from "@/internal/balances/utils/deduction/executeRedisDeduction.js";
import { syncItemV3 } from "@/internal/balances/utils/sync/syncItemV3.js";
import { getOrSetCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/getOrSetCachedFullCustomer.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { deleteCachedFullCustomer } from "../../../../src/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { timeout } from "../../../utils/genUtils.js";

const pro = constructProduct({
	type: "pro",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
			entityFeatureId: TestFeature.Users,
		}),
	],
});

const testCase = "track-race-condition4";

describe(`${chalk.yellowBright("track-race-condition4: sync should not wipe out newly created entity credits")}`, () => {
	const customerId = testCase;
	const autumnV2 = new AutumnInt({
		version: ApiVersion.V2_0,
	});

	const autumnV2WithoutCacheDeletion = new AutumnInt({
		version: ApiVersion.V2_0,
		skipCacheDeletion: true,
	});

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: true,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [pro],
			prefix: testCase,
		});

		await autumnV2.entities.create(customerId, [
			{
				id: "user-1",
				name: "User 1",
				feature_id: TestFeature.Users,
			},
		]);

		await autumnV2.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		await timeout(2500);
	});

	test("should manually reproduce race condition where sync wipes out newly created entity credits", async () => {
		console.log(
			chalk.cyan("\n=== Manually orchestrating race condition steps ===\n"),
		);

		// STEP 1: Get full customer and set it in Redis cache
		console.log(chalk.yellow("Step 1: Setting up customer in Redis cache..."));

		const fullCustomer = await getOrSetCachedFullCustomer({
			ctx,
			customerId,
			source: "test-setup",
		});
		console.log(chalk.green("✓ Customer cached in Redis"));

		// STEP 2: Track 5 messages using executeRedisDeduction() directly
		// This deducts from Redis WITHOUT automatically queuing a sync
		console.log(
			chalk.yellow(
				"\nStep 2: Tracking 5 messages directly via executeRedisDeduction() (no auto sync)...",
			),
		);

		const messagesFeature = ctx.features.find(
			(f) => f.id === TestFeature.Messages,
		)!;

		const deductionResult = await executeRedisDeduction({
			ctx,
			deductions: [
				{
					feature: messagesFeature,
					deduction: 5,
				},
			],
			fullCustomer,
			deductionOptions: {
				overageBehaviour: "cap",
			},
		});

		console.log(chalk.green("✓ Tracked 5 messages in Redis (no sync queued)"));
		console.log(
			"  Modified breakdown IDs:",
			Object.keys(deductionResult.updates),
		);

		// Get the customer from Redis to see current balance
		const customerAfterTrack =
			await autumnV2.customers.get<ApiCustomer>(customerId);

		console.log(
			chalk.blue(
				`  Current balance in Redis: ${customerAfterTrack.balances[TestFeature.Messages].current_balance}`,
			),
		);

		// STEP 3: Create a new entity
		console.log(chalk.yellow("\nStep 3: Creating a new entity..."));
		await autumnV2WithoutCacheDeletion.entities.create(customerId, [
			{
				id: "user-2",
				name: "User 2",
				feature_id: TestFeature.Users,
			},
		]);
		console.log(chalk.green("✓ New entity created"));

		// STEP 4: Manually call syncItemV3 to sync the OLD Redis balance to DB
		// This simulates the race condition where sync runs AFTER reset
		// The sync should detect that DB has newer data and NOT overwrite it
		console.log(
			chalk.yellow(
				"\nStep 4: Manually syncing OLD Redis balance to DB (testing race condition)...",
			),
		);

		// Get the cusEntIds from the deduction result
		const cusEntIds = Object.keys(deductionResult.updates);

		await syncItemV3({
			ctx,
			payload: {
				customerId,
				orgId: ctx.org.id,
				env: ctx.env,
				timestamp: Date.now(),
				region: currentRegion,
				cusEntIds,
			},
		});
		console.log(chalk.red("✓ Sync completed"));

		await deleteCachedFullCustomer({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId: customerId,
			source: "test-setup",
		});

		// Check that credits weren't wiped out (should be reset to 100)
		const cachedCustomer =
			await autumnV2.customers.get<ApiCustomer>(customerId);

		expect(cachedCustomer.balances[TestFeature.Messages].current_balance).toBe(
			200,
		);

		const customerAfterSync = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{
				skip_cache: "true",
			},
		);
		expect(
			customerAfterSync.balances[TestFeature.Messages].current_balance,
		).toBe(200);
	});
});
