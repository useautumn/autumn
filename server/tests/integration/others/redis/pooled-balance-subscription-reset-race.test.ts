import { afterEach, beforeAll, expect, test } from "bun:test";
import {
	EntInterval,
	type FullCusEntWithProduct,
	PooledBalanceResetOwnerType,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { waitForRedisReady } from "@/external/redis/initRedis.js";
import { computePooledBalanceResetPlan } from "@/internal/billing/v2/pooledBalances/reset/computePooledBalanceResetPlan.js";
import {
	type ResetPooledBalancesByOwnerDependencies,
	resetPooledBalancesByResetOwnerWithDependencies,
} from "@/internal/billing/v2/pooledBalances/reset/resetPooledCustomerEntitlements.js";

const customerId = "pooled-subscription-reset-race";
const redisOnlyBalanceKey = `${customerId}:redis-only-balance`;
const stripeNextResetAt = 2_000_000_000_000;

beforeAll(async () => {
	await waitForRedisReady(ctx.redisV2, customerId, 5000);
});

afterEach(async () => {
	await ctx.redisV2.del(redisOnlyBalanceKey);
});

test("subscription reset flushes a Redis-only deduction before calculating rollover", async () => {
	const events: string[] = [];
	const databaseState = { balance: 500 };
	const transaction = {
		execute: async () => {
			events.push("advisory-lock");
			return [];
		},
	};
	const db = {
		transaction: async <T>(
			callback: (lockedDb: typeof transaction) => Promise<T>,
		) => callback(transaction),
	};
	const raceContext = { ...ctx, db };

	// Track has deducted 100 in Redis, but its async Postgres sync has not run.
	await ctx.redisV2.set(redisOnlyBalanceKey, "400");

	const dependencies: ResetPooledBalancesByOwnerDependencies = {
		listPools: async () => {
			events.push("list");
			return [{ id: "pool_1" }] as never;
		},
		lockCustomer: async () => {
			events.push("customer-lock");
		},
		invalidateCachedSubject: async () => {
			events.push("flush");
			const redisBalance = await ctx.redisV2.get(redisOnlyBalanceKey);
			if (redisBalance === null) throw new Error("Missing Redis balance");
			databaseState.balance = Number(redisBalance);
			await ctx.redisV2.del(redisOnlyBalanceKey);
		},
		resetPool: async ({ subscriptionNextResetAt }) => {
			events.push("reset");
			expect(subscriptionNextResetAt).toBe(stripeNextResetAt);
			const customerEntitlement: FullCusEntWithProduct = {
				...customerEntitlements.create({
					id: "cus_ent_pool",
					featureId: "messages",
					featureName: "Messages",
					allowance: 0,
					balance: databaseState.balance,
					interval: EntInterval.Month,
					nextResetAt: 1,
					rollover: {
						max: null,
						duration: RolloverExpiryDurationType.Month,
						length: 1,
					},
				}),
				customer_product_id: null,
				customer_product: null,
			};
			const plan = computePooledBalanceResetPlan({
				customerEntitlement,
				resetAt: 1,
				lastAppliedResetAt: null,
				contributions: [
					{
						id: "contribution_1",
						currentCycleContribution: 500,
						nextCycleContribution: 500,
					},
				],
			});
			if (!plan) throw new Error("Expected reset plan");

			return {
				customerEntitlementId: "cus_ent_pool",
				featureId: "messages",
				resetAt: 1,
				balance: 500,
				adjustment: 500,
				nextResetAt: 2,
				applied: true,
				rolloverInsert: plan.rolloverInsert,
			};
		},
	};

	const results = await resetPooledBalancesByResetOwnerWithDependencies({
		ctx: raceContext as never,
		customerId,
		internalCustomerId: "internal_customer_1",
		resetOwnerType: PooledBalanceResetOwnerType.Subscription,
		resetOwnerId: "sub_1",
		now: 2,
		subscriptionNextResetAt: stripeNextResetAt,
		dependencies,
	});

	expect(events).toEqual([
		"advisory-lock",
		"list",
		"customer-lock",
		"flush",
		"reset",
	]);
	expect(results[0]?.rolloverInsert?.rows[0]?.balance).toBe(400);
});
