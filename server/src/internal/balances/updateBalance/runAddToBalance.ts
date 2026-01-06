import {
	FeatureNotFoundError,
	InternalError,
	nullish,
	type SortCusEntParams,
	type UpdateBalanceParams,
} from "@autumn/shared";
import { currentRegion, redis } from "@/external/redis/initRedis.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { normalizeToArray } from "@/utils/cacheUtils/normalizeFromSchema.js";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import { getOrCreateApiCustomer } from "../../customers/cusUtils/getOrCreateApiCustomer.js";
import { executeBatchDeduction } from "../track/redisTrackUtils/executeBatchDeduction.js";
import { runDeductionTx } from "../track/trackUtils/runDeductionTx.js";
import { syncItemV2 } from "../utils/sync/syncItemV2.js";

interface RedisAddToBalanceResult {
	fallback: boolean;
	code: "success" | "skip_cache" | "redis_write_failed" | "allocated_feature";
	customerChanged?: boolean;
	changedEntityIds?: string[];
	modifiedBreakdownIds?: string[];
}

/**
 * Executes add-to-balance against cached customer data in Redis
 * Uses negative deduction with adjustGrantedBalance=true to add to granted_balance
 */
const runRedisAddToBalance = async ({
	ctx,
	customerId,
	entityId,
	featureId,
	amountToAdd,
	cusEntId,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	featureId: string;
	amountToAdd: number;
	cusEntId?: string;
}): Promise<RedisAddToBalanceResult> => {
	const { org, env, skipCache } = ctx;

	if (skipCache) {
		return {
			fallback: true,
			code: "skip_cache",
		};
	}

	// Warm cache first
	await getOrCreateApiCustomer({
		ctx,
		customerId,
		entityId,
	});

	const result = await tryRedisWrite<RedisAddToBalanceResult>(async () => {
		// Execute batch deduction with adjustGrantedBalance=true
		// Negative deduction = add to granted_balance
		const deductionResult = await executeBatchDeduction({
			redis,
			requests: [
				{
					featureDeductions: [
						{
							featureId,
							amount: -amountToAdd, // Negative = add to balance
						},
					],
					overageBehavior: "allow", // Allow mode bypasses restrictions for adding
					entityId,
					filters: cusEntId ? { id: cusEntId } : undefined,
				},
			],
			orgId: org.id,
			env,
			customerId,
			adjustGrantedBalance: true, // This makes it modify granted_balance instead of usage
		});

		// Handle PAID_ALLOCATED error - fallback to Postgres
		if (deductionResult.error === "PAID_ALLOCATED") {
			ctx.logger.info(
				`[runRedisAddToBalance] Paid allocated feature detected, falling back to Postgres`,
			);
			return {
				fallback: true,
				code: "allocated_feature",
			};
		}

		// Handle CUSTOMER_NOT_FOUND - fallback to Postgres
		if (deductionResult.error === "CUSTOMER_NOT_FOUND") {
			ctx.logger.info(
				`[runRedisAddToBalance] Customer not found in cache, falling back to Postgres`,
			);
			return {
				fallback: true,
				code: "redis_write_failed",
			};
		}

		if (!deductionResult.success) {
			return {
				fallback: true,
				code: "redis_write_failed",
			};
		}

		return {
			fallback: false,
			code: "success",
			customerChanged: deductionResult.customerChanged,
			changedEntityIds: normalizeToArray(deductionResult.changedEntityIds),
			modifiedBreakdownIds: normalizeToArray(
				deductionResult.modifiedBreakdownIds,
			),
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

/**
 * Coordinates adding to a balance in both Redis and Postgres
 *
 * Uses Redis-first approach with negative deduction + adjustGrantedBalance=true
 * to atomically add to granted_balance, then syncs to Postgres.
 */
export const runAddToBalance = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateBalanceParams;
}) => {
	const { org, env, features } = ctx;
	const {
		customer_id: customerId,
		entity_id: entityId,
		feature_id: featureId,
		add_to_balance: amountToAdd,
		customer_entitlement_id: cusEntId,
	} = params;

	if (nullish(cusEntId)) {
		throw new InternalError({
			message: "Balance ID param is required if add_to_balance is passed in",
		});
	}

	// Look up feature
	const feature = features.find((f) => f.id === featureId);
	if (!feature) {
		throw new FeatureNotFoundError({ featureId });
	}

	// amountToAdd is required for this function
	if (amountToAdd === undefined) {
		throw new Error("add_to_balance is required for runAddToBalance");
	}

	// 1. Try Redis first
	const redisResult = await runRedisAddToBalance({
		ctx,
		customerId,
		entityId,
		featureId,
		amountToAdd,
		cusEntId,
	});

	// 2. If Redis failed, fall back to Postgres-only
	if (redisResult.fallback) {
		ctx.logger.info(
			`[runAddToBalance] Redis fallback (${redisResult.code}), using Postgres-only approach`,
		);

		const sortParams: SortCusEntParams | undefined = cusEntId
			? { cusEntIds: [cusEntId] }
			: undefined;

		await runDeductionTx({
			ctx,
			customerId,
			entityId,
			deductions: [
				{
					feature,
					deduction: -amountToAdd, // Negative deduction = add to balance
				},
			],
			sortParams,
			skipAdditionalBalance: true,
			alterGrantedBalance: true,
			refreshCache: true,
		});

		return;
	}

	// 3. Queue sync to Postgres
	const { customerChanged, changedEntityIds, modifiedBreakdownIds } =
		redisResult;

	ctx.logger.info(
		`[runAddToBalance] Redis updated successfully, customerChanged: ${customerChanged}, changedEntityIds: ${changedEntityIds?.join(", ") || "none"}`,
	);

	// Sync customer-level balance if changed
	if (customerChanged) {
		await syncItemV2({
			item: {
				customerId,
				featureId: feature.id,
				orgId: org.id,
				env,
				entityId: undefined, // Customer-level sync
				region: currentRegion,
				timestamp: Date.now(),
				breakdownIds: modifiedBreakdownIds || [],
			},
			ctx,
		});
	}

	// Sync each changed entity's balance
	if (changedEntityIds && changedEntityIds.length > 0) {
		for (const changedEntityId of changedEntityIds) {
			await syncItemV2({
				item: {
					customerId,
					featureId: feature.id,
					orgId: org.id,
					env,
					entityId: changedEntityId,
					region: currentRegion,
					timestamp: Date.now(),
					breakdownIds: modifiedBreakdownIds || [],
				},
				ctx,
			});
		}
	}
};
