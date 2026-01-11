import {
	FeatureNotFoundError,
	resetIntvToEntIntv,
	type SortCusEntParams,
	type UpdateBalanceParams,
} from "@autumn/shared";
import { currentRegion } from "@/external/redis/initRedis.js";
import { getCachedApiCustomer } from "@/internal/customers/cusUtils/apiCusCacheUtils/getCachedApiCustomer.js";
import { getCachedApiEntity } from "@/internal/entities/entityUtils/apiEntityCacheUtils/getCachedApiEntity.js";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import type { BatchRequestFilters } from "../track/redisTrackUtils/executeBatchDeduction.js";
import { runDeductionTx } from "../track/trackUtils/runDeductionTx.js";
import { syncItemV2 } from "../utils/sync/legacy/syncItemV2.js";
import { runRedisUpdateBalance } from "./runRedisUpdateBalance.js";

/**
 * Coordinates updating a balance in both Redis and Postgres atomically
 *
 * Flow:
 * 1. Warm up Redis cache by fetching customer/entity (ensures balance data exists)
 * 2. Update Redis first (prevents race conditions with track operations)
 * 3. If Redis fails, fall back to Postgres-only update
 * 4. Sync to Postgres using the modified breakdown IDs from Redis
 *
 * Requires params.current_balance to be set.
 */
export const runUpdateBalance = async ({
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
		current_balance: targetBalance,
		customer_entitlement_id: cusEntId,
		interval: resetInterval,
	} = params;

	// Look up feature
	const feature = features.find((f) => f.id === featureId);
	if (!feature) {
		throw new FeatureNotFoundError({ featureId });
	}

	// targetBalance is required for this function
	if (targetBalance === undefined) {
		throw new Error("current_balance is required for runUpdateBalance");
	}

	// Build filters for Redis (uses ResetInterval - same as ApiBalance schema)
	const filters: BatchRequestFilters | undefined =
		cusEntId || resetInterval
			? {
					id: cusEntId,
					interval: resetInterval,
				}
			: undefined;

	// 1. Warm up the Redis cache by fetching the customer/entity
	// This ensures the balance data exists in Redis before we try to update it
	if (entityId) {
		await getCachedApiEntity({
			ctx,
			customerId,
			entityId,
		});
	} else {
		await getCachedApiCustomer({
			ctx,
			customerId,
		});
	}

	// 2. Update Redis first
	const redisResult = await runRedisUpdateBalance({
		ctx,
		customerId,
		entityId,
		feature,
		targetBalance,
		filters,
	});

	// 3. If Redis failed, fall back to Postgres-only update
	if (redisResult.fallback) {
		ctx.logger.info(
			`[runUpdateBalance] Redis fallback (${redisResult.code}), using Postgres-only update`,
		);

		// Convert ResetInterval to EntInterval for Postgres sortParams
		const entInterval = resetInterval
			? resetIntvToEntIntv({ resetIntv: resetInterval })
			: undefined;

		const sortParams: SortCusEntParams | undefined =
			cusEntId || entInterval
				? {
						cusEntIds: cusEntId ? [cusEntId] : undefined,
						interval: entInterval,
					}
				: undefined;

		await runDeductionTx({
			ctx,
			customerId,
			entityId,
			deductions: [
				{
					feature,
					deduction: 0,
					targetBalance,
				},
			],
			skipAdditionalBalance: true,
			alterGrantedBalance: true,
			sortParams,
			refreshCache: true, // Refresh cache since we're updating Postgres directly
		});

		return;
	}

	// 4. Sync Redis -> Postgres for modified scopes
	const { customerChanged, changedEntityIds, modifiedBreakdownIds } =
		redisResult;

	ctx.logger.info(
		`[runUpdateBalance] Redis updated successfully, customerChanged: ${customerChanged}, changedEntityIds: ${changedEntityIds?.join(", ") || "none"}`,
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
