import type { ApiBalance, Feature } from "@autumn/shared";
import { ApiBalanceSchema } from "@autumn/shared";
import { redis } from "@/external/redis/initRedis.js";
import {
	normalizeFromSchema,
	normalizeToArray,
} from "@/utils/cacheUtils/normalizeFromSchema.js";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import { tryRedisWrite } from "../../../utils/cacheUtils/cacheUtils.js";
import {
	type BatchRequestFilters,
	executeBatchDeduction,
} from "../track/redisTrackUtils/executeBatchDeduction.js";

export interface RunRedisUpdateBalanceParams {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	feature: Feature;
	targetBalance: number;
	filters?: BatchRequestFilters;
}

export interface RunRedisUpdateBalanceResult {
	fallback: boolean;
	code:
		| "success"
		| "allocated_feature"
		| "skip_cache"
		| "redis_write_failed"
		| "customer_not_found";
	balances?: Record<string, ApiBalance>;
	modifiedBreakdownIds?: string[];
	customerChanged?: boolean;
	changedEntityIds?: string[];
}

/**
 * Updates a balance in Redis cache using syncMode with targetBalance
 * This is used by handleUpdateBalance to update Redis atomically before syncing to Postgres
 *
 * Unlike runRedisDeduction:
 * - Uses syncMode to set to target balance (not deduct)
 * - Supports filters to target specific breakdown items
 * - Does NOT queue background sync (caller handles sync)
 * - Does NOT batch requests (update balance is typically single request)
 */
export const runRedisUpdateBalance = async ({
	ctx,
	customerId,
	entityId,
	feature,
	targetBalance,
	filters,
}: RunRedisUpdateBalanceParams): Promise<RunRedisUpdateBalanceResult> => {
	const { org, env, skipCache } = ctx;

	if (skipCache) {
		return {
			fallback: true,
			code: "skip_cache",
		};
	}

	const result = await tryRedisWrite<RunRedisUpdateBalanceResult>(async () => {
		// Execute directly without batching manager (update balance is single-shot, not batched)
		const result = await executeBatchDeduction({
			redis,
			requests: [
				{
					featureDeductions: [
						{
							featureId: feature.id,
							amount: 0, // Will be calculated by Lua using targetBalance
						},
					],
					overageBehavior: "allow", // "allow" bypasses granted_balance cap for increasing balance
					syncMode: true,
					targetBalance,
					entityId,
					filters,
				},
			],
			orgId: org.id,
			env,
			customerId,
			adjustGrantedBalance: true, // Update balance should adjust granted_balance, not usage
		});

		// Normalize balances if present
		if (result.balances) {
			result.balances = Object.fromEntries(
				Object.entries(result.balances).map(([featureId, balance]) => [
					featureId,
					normalizeFromSchema({ schema: ApiBalanceSchema, data: balance }),
				]),
			);
		}

		// Handle PAID_ALLOCATED error - fallback to Postgres
		if (result.error === "PAID_ALLOCATED") {
			ctx.logger.info(
				`Paid allocated feature detected, falling back to Postgres for update balance`,
			);
			return {
				fallback: true,
				code: "allocated_feature",
			};
		}

		// Handle CUSTOMER_NOT_FOUND - fallback to Postgres
		if (result.error === "CUSTOMER_NOT_FOUND") {
			ctx.logger.info(
				`Customer not found in cache for update balance, falling back to Postgres`,
			);
			return {
				fallback: true,
				code: "customer_not_found",
			};
		}

		if (!result.success) {
			return {
				fallback: true,
				code: "redis_write_failed",
			};
		}

		return {
			fallback: false,
			code: "success",
			balances: result.balances,
			// Normalize Lua empty tables {} to arrays []
			modifiedBreakdownIds: normalizeToArray(result.modifiedBreakdownIds),
			customerChanged: result.customerChanged,
			changedEntityIds: normalizeToArray(result.changedEntityIds),
		};
	});

	if (result === null) {
		return {
			fallback: true,
			code: "redis_write_failed",
		};
	}

	return result;
};
