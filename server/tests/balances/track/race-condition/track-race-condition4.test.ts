import { beforeAll, describe, expect, test } from "bun:test";
import { type ApiCustomer, ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { waitForRedisReady } from "@/external/redis/initRedis.js";
import { executeRedisDeductionV2 } from "@/internal/balances/utils/deductionV2/executeRedisDeductionV2.js";
import { syncItemV4 } from "@/internal/balances/utils/sync/syncItemV4.js";
import {
	getOrSetCachedFullSubject,
	invalidateCachedFullSubject,
} from "@/internal/customers/cache/fullSubject/index.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
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
const getMessagesRemaining = (customer: ApiCustomer) => {
	const balance = customer.balances[TestFeature.Messages] as {
		current_balance?: number;
		remaining?: number;
	};
	return balance.remaining ?? balance.current_balance;
};

describe(`${chalk.yellowBright("track-race-condition4: sync should not wipe out newly created entity credits")}`, () => {
	const customerId = testCase;
	const autumnV2 = new AutumnInt({
		version: ApiVersion.V2_1,
	});

	const autumnV2WithoutCacheDeletion = new AutumnInt({
		version: ApiVersion.V2_1,
		skipCacheDeletion: true,
	});

	beforeAll(async () => {
		await waitForRedisReady(ctx.redisV2, "customer-redis", 5000);

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

		console.log(chalk.yellow("Step 1: Setting up subject in Redis cache..."));

		const fullSubject = await getOrSetCachedFullSubject({
			ctx,
			customerId,
			source: "test-setup",
		});
		console.log(chalk.green("✓ Subject cached in Redis"));

		console.log(
			chalk.yellow(
				"\nStep 2: Tracking 5 messages directly via executeRedisDeductionV2() (no auto sync)...",
			),
		);

		const messagesFeature = ctx.features.find(
			(f) => f.id === TestFeature.Messages,
		)!;

		const deductionResult = await executeRedisDeductionV2({
			ctx,
			deductions: [
				{
					feature: messagesFeature,
					deduction: 5,
				},
			],
			fullSubject,
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
				`  Current balance in Redis: ${getMessagesRemaining(customerAfterTrack)}`,
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

		console.log(
			chalk.yellow(
				"\nStep 4: Manually syncing OLD Redis balance to DB (testing race condition)...",
			),
		);

		await syncItemV4({
			ctx,
			payload: {
				customerId,
				orgId: ctx.org.id,
				env: ctx.env,
				timestamp: Date.now(),
				rolloverIds: Object.keys(deductionResult.rolloverUpdates),
				modifiedCusEntIdsByFeatureId:
					deductionResult.modifiedCusEntIdsByFeatureId,
				usageWindowUpdates: deductionResult.usageWindowUpdates,
			},
		});
		console.log(chalk.red("✓ Sync completed"));

		await invalidateCachedFullSubject({
			ctx,
			customerId,
			source: "test-setup",
		});

		// Check that credits weren't wiped out (should be reset to 100)
		const cachedCustomer =
			await autumnV2.customers.get<ApiCustomer>(customerId);

		expect(getMessagesRemaining(cachedCustomer)).toBe(200);

		const customerAfterSync = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{
				skip_cache: "true",
			},
		);
		expect(getMessagesRemaining(customerAfterSync)).toBe(200);
	});
});
