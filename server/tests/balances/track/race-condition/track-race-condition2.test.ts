import { beforeAll, describe, expect, test } from "bun:test";
import { type ApiCustomer, ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { currentRegion } from "@/external/redis/initRedis.js";
import { runRedisDeduction } from "@/internal/balances/track/redisTrackUtils/runRedisDeduction.js";
import { syncItem } from "@/internal/balances/utils/sync/syncItem.js";
import { getTrackFeatureDeductions } from "@/internal/balances/track/trackUtils/getFeatureDeductions.js";
import { CusService } from "@/internal/customers/CusService.js";
import { setCachedApiCustomer } from "@/internal/customers/cusUtils/apiCusCacheUtils/setCachedApiCustomer.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { resetAndGetCusEnt } from "../../../advanced/rollovers/rolloverTestUtils.js";
import { timeout } from "../../../utils/genUtils.js";

const pro = constructProduct({
	type: "pro",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
	],
});

const testCase = "track-race-condition2";

describe(`${chalk.yellowBright("track race condition 2: track runs when credits are refreshing")}`, () => {
	const customerId = testCase;
	const autumnV2 = new AutumnInt({
		version: ApiVersion.V2_0,
	});
	const autumnV2SkipCacheDeletion: AutumnInt = new AutumnInt({
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

		await autumnV2.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 80,
		});

		await timeout(2500);
	});

	test("should manually reproduce race condition where sync wipes out refreshed credits", async () => {
		console.log(
			chalk.cyan("\n=== Manually orchestrating race condition steps ===\n"),
		);

		// STEP 1: Get full customer and set it in Redis cache
		console.log(chalk.yellow("Step 1: Setting up customer in Redis cache..."));

		const fullCus = await CusService.getFull({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
			withEntities: true,
			withSubs: true,
		});

		await setCachedApiCustomer({
			ctx,
			fullCus,
			customerId,
			source: "test-setup",
			fetchTimeMs: Date.now(),
		});
		console.log(chalk.green("✓ Customer cached in Redis"));

		// STEP 2: Track 5 messages using runRedisDeduction directly
		// This will deduct from Redis and should queue a sync item
		console.log(
			chalk.yellow(
				"\nStep 2: Tracking 5 messages directly via runRedisDeduction...",
			),
		);
		const featureDeductions = getTrackFeatureDeductions({
			ctx,
			featureId: TestFeature.Messages,
			value: 5,
		});

		const deductionResult = await runRedisDeduction({
			ctx,
			query: {},
			trackParams: {
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 5,
			},
			featureDeductions,
			overageBehavior: "cap",
		});

		console.log(chalk.green("✓ Tracked 5 messages in Redis"));

		// Get the customer from Redis to see current balance
		const customerAfterTrack =
			await autumnV2.customers.get<ApiCustomer>(customerId);

		console.log(
			chalk.blue(
				`  Current balance in Redis: ${customerAfterTrack.balances[TestFeature.Messages].current_balance}`,
			),
		);

		// STEP 3: Reset credits (simulates the cron reset operation)
		await resetAndGetCusEnt({
			db: ctx.db,
			customer: fullCus,
			productGroup: pro.group!,
			featureId: TestFeature.Messages,
			skipCacheDeletion: true,
		});

		// STEP 4: Manually call syncItem to sync the OLD Redis balance to DB
		// This should wipe out the 250 credits we just attached
		console.log(
			chalk.yellow(
				"\nStep 4: Manually syncing OLD Redis balance to DB (this should wipe out the credits)...",
			),
		);
		await syncItem({
			item: {
				customerId,
				featureId: TestFeature.Messages,
				orgId: ctx.org.id,
				env: ctx.env,
				timestamp: Date.now(),
				region: currentRegion,
			},
			ctx,
		});
		console.log(chalk.red("✓ Sync completed "));

		// 1. Check that credits weren't wiped out
		const cachedCustomer =
			await autumnV2.customers.get<ApiCustomer>(customerId);

		expect(cachedCustomer.balances[TestFeature.Messages].current_balance).toBe(
			100,
		);

		const customerAfterSync = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{
				skip_cache: "true",
			},
		);
		expect(
			customerAfterSync.balances[TestFeature.Messages].current_balance,
		).toBe(100);
	});
});

