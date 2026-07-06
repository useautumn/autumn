/**
 * TDD test: full-subject invalidation must not lose un-synced Redis deductions.
 *
 * Contract under test:
 *   New behaviors:
 *     - (unsynced Redis deduction) + (invalidateCachedFullSubject) -> deduction
 *       is flushed to Postgres via sync_balances_v2 before the cache is wiped.
 *   Side effects:
 *     - Balance hash cusEnt fields are still deleted (invalidation semantics kept).
 *     - Post-invalidation reads (skip_cache and rebuilt cache) both reflect the
 *       deduction instead of reverting to the pre-track balance.
 *
 * Pre-impl red: invalidateSharedBalanceFields blindly HDELs the balance hash
 * fields, so the unsynced deduction never reaches Postgres and both reads
 * show 100. Post-impl green: the fields are destructively read (atomic Lua)
 * and flushed, so both reads show 95.
 */

import { beforeAll, describe, expect, test } from "bun:test";
import { type ApiCustomer, ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { waitForRedisReady } from "@/external/redis/initRedis.js";
import { executeRedisDeductionV2 } from "@/internal/balances/utils/deductionV2/executeRedisDeductionV2.js";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";
import {
	getOrSetCachedFullSubject,
	invalidateCachedFullSubject,
} from "@/internal/customers/cache/fullSubject/index.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const pro = constructProduct({
	type: "pro",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
	],
});

const testCase = "invalidation-flush-unsynced-balances";

const getMessagesRemaining = (customer: ApiCustomer) => {
	const balance = customer.balances[TestFeature.Messages] as {
		current_balance?: number;
		remaining?: number;
	};
	return balance.remaining ?? balance.current_balance;
};

describe(`${chalk.yellowBright("invalidation-flush: invalidation must not lose unsynced deductions")}`, () => {
	const customerId = testCase;
	const autumnV2 = new AutumnInt({ version: ApiVersion.V2_1 });

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

		await autumnV2.attach({
			customer_id: customerId,
			product_id: pro.id,
		});
	});

	test("flushes unsynced Redis balances to Postgres during invalidation", async () => {
		const fullSubject = await getOrSetCachedFullSubject({
			ctx,
			customerId,
			source: "test-setup",
		});

		const messagesFeature = ctx.features.find(
			(feature) => feature.id === TestFeature.Messages,
		)!;

		// Deduct 5 in Redis WITHOUT queuing sync — stands in for a /track whose
		// async syncItemV4 has not landed yet.
		await executeRedisDeductionV2({
			ctx,
			deductions: [{ feature: messagesFeature, deduction: 5 }],
			fullSubject,
			deductionOptions: { overageBehaviour: "cap" },
		});

		const cachedBeforeInvalidation =
			await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(getMessagesRemaining(cachedBeforeInvalidation)).toBe(95);

		await invalidateCachedFullSubject({
			ctx,
			customerId,
			source: "test-invalidation",
		});

		// ── Contract: invalidation semantics preserved ───────────────────────
		// The balance hash fields must still be deleted.
		const balanceKey = buildSharedFullSubjectBalanceKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(await ctx.redisV2.hlen(balanceKey)).toBe(0);

		// ── Contract: deduction flushed to Postgres ──────────────────────────
		// Pre-fix: HDEL wiped the unsynced deduction, DB shows 100.
		// Post-fix: destructive read + sync_balances_v2 flush, DB shows 95.
		const dbCustomer = await autumnV2.customers.get<ApiCustomer>(customerId, {
			skip_cache: "true",
		});
		expect(getMessagesRemaining(dbCustomer)).toBe(95);

		// ── Contract: rebuilt cache reflects the flushed balance ─────────────
		const rebuiltCustomer =
			await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(getMessagesRemaining(rebuiltCustomer)).toBe(95);
	});
});
