/**
 * Preview race: a grant issued while a deduction is still un-synced.
 *
 * `balances.create` invalidates the subject. Without a flush, the blind HDEL in
 * `invalidateSharedBalanceFields` wipes the balance hash fields while the
 * deduction lives only in Redis — syncItemV4 then logs "Cache miss for feature"
 * and drops it, so the rebuilt cache reverts to the pre-deduction balance in
 * Postgres. The spend disappears while events.list still reports it.
 *
 * The deduction is applied through `executeRedisDeductionV2` WITHOUT queuing a
 * sync item, which is the deterministic stand-in for a /track whose batched
 * syncItemV4 has not landed yet (SyncBatchingManagerV3, ~1s window). No sleeps,
 * no real timing race.
 *
 * Pre-impl red: remaining reverts to the full 200 (grant + grant, spend lost).
 * Post-impl green: both reads show 195.
 */

import { beforeAll, describe, expect, test } from "bun:test";
import { type ApiCustomer, ApiVersion, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { waitForRedisReady } from "@/external/redis/initRedis.js";
import { executeRedisDeductionV2 } from "@/internal/balances/utils/deductionV2/executeRedisDeductionV2.js";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";
import { getOrSetCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";

const testCase = "balances-create-flush-unsynced-balances";

const GRANT = 100;
const SPEND = 5;

const getMessagesRemaining = (customer: ApiCustomer) => {
	const balance = customer.balances[TestFeature.Messages] as {
		current_balance?: number;
		remaining?: number;
	};
	return balance.remaining ?? balance.current_balance;
};

describe(`${chalk.yellowBright("balances.create must not lose unsynced deductions")}`, () => {
	const customerId = testCase;
	const autumn = new AutumnInt({
		version: ApiVersion.V2_1,
		secretKey: ctx.orgSecretKey,
	});

	beforeAll(async () => {
		await waitForRedisReady(ctx.redisV2, "customer-redis", 5000);

		// Re-runnable: balance_id is unique per customer, so start from a clean one.
		await autumn.customers.delete(customerId).catch(() => {
			/* first run — nothing to delete */
		});

		await autumn.customers.create({ id: customerId, name: testCase });

		// A loose one-off grant — no plan, no attach, no Stripe.
		await autumn.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			included_grant: GRANT,
			reset: { interval: ResetInterval.OneOff },
			balance_id: "starter",
		});
	});

	test("keeps a deduction that balances.create invalidates before its sync lands", async () => {
		const fullSubject = await getOrSetCachedFullSubject({
			ctx,
			customerId,
			source: "test-setup",
		});

		const messagesFeature = ctx.features.find(
			(feature) => feature.id === TestFeature.Messages,
		)!;

		// Deduct in Redis WITHOUT queuing sync — the un-synced window.
		await executeRedisDeductionV2({
			ctx,
			deductions: [{ feature: messagesFeature, deduction: SPEND }],
			fullSubject,
			deductionOptions: { overageBehaviour: "cap" },
		});

		const cachedBeforeGrant =
			await autumn.customers.get<ApiCustomer>(customerId);
		expect(getMessagesRemaining(cachedBeforeGrant)).toBe(GRANT - SPEND);

		// The invalidating call: a second grant, as a customer would issue it.
		await autumn.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			included_grant: GRANT,
			reset: { interval: ResetInterval.OneOff },
			balance_id: "second",
		});

		// ── Contract: invalidation semantics preserved ───────────────────────
		const balanceKey = buildSharedFullSubjectBalanceKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(await ctx.redisV2.hlen(balanceKey)).toBe(0);

		// ── Contract: the deduction reached Postgres ─────────────────────────
		// Pre-fix: the HDEL wiped it, both reads show the full 2 x GRANT.
		const dbCustomer = await autumn.customers.get<ApiCustomer>(customerId, {
			skip_cache: "true",
		});
		expect(getMessagesRemaining(dbCustomer)).toBe(GRANT * 2 - SPEND);

		// ── Contract: rebuilt cache agrees ───────────────────────────────────
		const rebuiltCustomer = await autumn.customers.get<ApiCustomer>(customerId);
		expect(getMessagesRemaining(rebuiltCustomer)).toBe(GRANT * 2 - SPEND);
	});
});
