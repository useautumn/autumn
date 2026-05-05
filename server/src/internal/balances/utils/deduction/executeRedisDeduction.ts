import type {
	FullCusEntWithFullCusProduct,
	FullCustomer,
} from "@autumn/shared";
import type { Redis } from "ioredis";
import { currentRegion, redis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { triggerAutoTopUp } from "@/internal/balances/autoTopUp/triggerAutoTopUp.js";
import { handlePaidAllocatedCusEnt } from "@/internal/balances/utils/paidAllocatedFeature/handlePaidAllocatedCusEnt.js";
import { rollbackDeduction } from "@/internal/balances/utils/paidAllocatedFeature/rollbackDeduction.js";
import { buildFullCustomerCacheKey } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/fullCustomerCacheConfig.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { fireTrackWebhooks } from "../../trackWebhooks/fireTrackWebhooks.js";
import type { DeductionOptions } from "../types/deductionTypes.js";
import type { DeductionUpdate } from "../types/deductionUpdate.js";
import type { FeatureDeduction } from "../types/featureDeduction.js";
import type { MutationLogItem } from "../types/mutationLogItem.js";
import {
	RedisDeductionError,
	RedisDeductionErrorCode,
} from "../types/redisDeductionError.js";
import type { LuaDeductionResult } from "../types/redisDeductionResult.js";
import type { RolloverUpdate } from "../types/rolloverUpdate.js";
import { applyDeductionUpdateToFullCustomer } from "./applyDeductionUpdateToFullCustomer.js";
import { applyRolloverUpdatesToFullCustomer } from "./applyRolloverUpdatesToFullCustomer.js";
import { logDeductionUpdates } from "./logDeductionUpdates.js";
import { mutationLogsToFeatures } from "./mutationLogsToFeatures.js";
import { prepareDeductionOptions } from "./prepareDeductionOptions.js";
import { prepareFeatureDeduction } from "./prepareFeatureDeduction.js";

export const executeRedisDeduction = async ({
	ctx,
	entityId,
	deductions,
	fullCustomer,
	deductionOptions = {},
	redisInstance,
}: {
	ctx: AutumnContext;
	entityId?: string;
	deductions: FeatureDeduction[];
	fullCustomer: FullCustomer;
	deductionOptions?: DeductionOptions;
	redisInstance?: Redis;
}): Promise<{
	oldFullCus: FullCustomer;
	fullCus: FullCustomer | undefined;
	updates: Record<string, DeductionUpdate>;
	rolloverUpdates: Record<string, RolloverUpdate>;
	mutationLogs: MutationLogItem[];
}> => {
	const { org, env } = ctx;
	const oldFullCus = structuredClone(fullCustomer);

	const options = prepareDeductionOptions({
		options: deductionOptions,
		fullCustomer,
		deductions,
	});

	if (options.paidAllocated) {
		throw new RedisDeductionError({
			message: `Paid allocated deductions are not supported for Redis`,
			code: RedisDeductionErrorCode.PaidAllocated,
		});
	}

	if (options.paidAllocated && deductions.some((d) => d.lock)) {
		throw new RedisDeductionError({
			message: "Locks are not supported for paid allocated features",
			code: RedisDeductionErrorCode.PaidAllocated,
		});
	}

	if (ctx.skipCache) {
		throw new RedisDeductionError({
			message: `Skipping cache is not supported for Redis`,
			code: RedisDeductionErrorCode.SkipCache,
		});
	}

	let allUpdates: Record<string, DeductionUpdate> = {};
	let allRolloverUpdates: Record<string, RolloverUpdate> = {};
	let allMutationLogs: MutationLogItem[] = [];

	// Build cache key
	const customerId = fullCustomer.id || fullCustomer.internal_id;
	const cacheKey = buildFullCustomerCacheKey({
		orgId: org.id,
		env,
		customerId,
	});

	for (const deduction of deductions) {
		const {
			feature,
			deduction: toDeduct,
			targetBalance,
			unwindValue,
			lockReceiptKey,
		} = deduction;

		const {
			customerEntitlementDeductions,
			spendLimitByFeatureId,
			usageBasedCusEntIdsByFeatureId,
			rollovers,
			customerEntitlements,
			unlimitedFeatureIds,
			lock: preparedLock,
		} = await prepareFeatureDeduction({
			ctx,
			fullCustomer,
			deduction,
			options,
		});

		if (unlimitedFeatureIds.length > 0) {
			continue;
		}

		// Call Lua script to deduct from FullCustomer in Redis
		const luaParams = {
			org_id: org.id,
			env,
			customer_id: customerId,
			sorted_entitlements: customerEntitlementDeductions,
			spend_limit_by_feature_id: spendLimitByFeatureId ?? null,
			usage_based_cus_ent_ids_by_feature_id:
				usageBasedCusEntIdsByFeatureId ?? null,
			amount_to_deduct: toDeduct ?? null,
			target_balance: targetBalance ?? null,
			target_entity_id: entityId || null,
			rollovers: rollovers.length > 0 ? rollovers : null,
			skip_additional_balance: options.skipAdditionalBalance,
			alter_granted_balance: options.alterGrantedBalance,
			overage_behaviour: options.overageBehaviour,
			feature_id: feature.id,
			lock: preparedLock
				? {
						...preparedLock,
						region: currentRegion,
					}
				: null,

			// For unwinding when finalizing a lock
			unwind_value: unwindValue ?? null,
			lock_receipt_key: lockReceiptKey ?? null,
		};

		const targetRedis = redisInstance ?? redis;
		const result = await tryRedisWrite(
			() =>
				targetRedis.deductFromCustomerEntitlements(
					cacheKey,
					JSON.stringify(luaParams),
				),
			redisInstance,
		);

		if (!result) {
			throw new RedisDeductionError({
				message: "Redis not ready for deduction",
				code: RedisDeductionErrorCode.RedisUnavailable,
			});
		}

		const resultJson = JSON.parse(result) as LuaDeductionResult;

		if (resultJson.logs && resultJson.logs.length > 0) {
			ctx.logger.debug(
				`[executeRedisDeduction] Logs: ${resultJson.logs.join("\n")}`,
			);
		}

		if (resultJson.error) {
			throw new RedisDeductionError({
				message: `Redis deduction failed: ${resultJson.error}`,
				code: resultJson.error as RedisDeductionErrorCode,
			});
		}

		const { updates, rollover_updates } = resultJson;
		const mutation_logs = Array.isArray(resultJson.mutation_logs)
			? resultJson.mutation_logs
			: [];
		logDeductionUpdates({
			ctx,
			fullCustomer,
			updates,
			source: "executeRedisDeduction",
		});

		allUpdates = { ...allUpdates, ...updates };
		allRolloverUpdates = { ...allRolloverUpdates, ...rollover_updates };
		allMutationLogs = [...allMutationLogs, ...mutation_logs];

		// Handle paid allocated entitlements and update fullCus in memory
		try {
			// Apply rollover updates first
			applyRolloverUpdatesToFullCustomer({
				fullCus: fullCustomer,
				rolloverUpdates: rollover_updates,
			});

			// Apply customer entitlement updates
			for (const cusEntId of Object.keys(updates)) {
				const update = updates[cusEntId];
				const cusEnt = customerEntitlements.find(
					(ce: FullCusEntWithFullCusProduct) => ce.id === cusEntId,
				);

				if (!cusEnt) continue;

				await handlePaidAllocatedCusEnt({
					ctx,
					cusEnt,
					fullCus: fullCustomer,
					updates,
				});

				applyDeductionUpdateToFullCustomer({
					fullCus: fullCustomer,
					cusEntId,
					update,
				});
			}
		} catch (error) {
			if (error instanceof Error && !error?.message?.includes("declined")) {
				ctx.logger.error(
					`[executeRedisDeduction] Attempting rollback due to error: ${error}`,
				);
			}
			await rollbackDeduction({
				ctx,
				oldFullCus,
				updates,
			});
			throw error;
		}

		const featuresFromMutationLogs = mutationLogsToFeatures({
			fullCustomer,
			mutationLogs: mutation_logs,
		});

		fireTrackWebhooks({
			ctx,
			oldFullCus,
			newFullCus: fullCustomer,
			feature: deduction.feature,
			entityId,
			featuresFromMutationLogs,
		});

		if (options.triggerAutoTopUp) {
			triggerAutoTopUp({
				ctx,
				newFullCus: fullCustomer,
				feature: deduction.feature,
			}).catch((error) => {
				ctx.logger.error(
					`[executeRedisDeduction] Failed to trigger auto top-up: ${error}`,
				);
			});
		}
	}

	return {
		oldFullCus,
		fullCus: fullCustomer,
		updates: allUpdates,
		rolloverUpdates: allRolloverUpdates,
		mutationLogs: allMutationLogs,
	};
};
