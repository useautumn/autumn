import {
	type FullCusEntWithFullCusProduct,
	type FullSubject,
	fullSubjectToFullCustomer,
	notNullish,
} from "@autumn/shared";
import type { Redis } from "ioredis";
import { currentRegion } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { triggerAutoTopUp } from "@/internal/balances/autoTopUp/triggerAutoTopUp.js";
import {
	getRedisTrackFeatureIdempotencyKey,
	TRACK_V3_IDEMPOTENCY_TTL_MS,
} from "@/internal/balances/track/v3/trackIdempotencyKey.js";
import { fireTrackWebhooks } from "@/internal/balances/trackWebhooks/fireTrackWebhooks.js";
import { createAllocatedInvoice } from "@/internal/balances/utils/allocatedInvoice/createAllocatedInvoice.js";
import { saveLockReceiptV2 } from "@/internal/balances/utils/lockV2/saveLockReceiptV2.js";
import { buildDeductFromSubjectBalancesKeys } from "@/internal/customers/cache/fullSubject/builders/buildDeductFromSubjectBalancesKeys.js";
import { buildFullSubjectKey } from "@/internal/customers/cache/fullSubject/builders/buildFullSubjectKey.js";
import { FULL_SUBJECT_CACHE_TTL_SECONDS } from "@/internal/customers/cache/fullSubject/config/fullSubjectCacheConfig.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
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
import type { UsageWindowMutation } from "../types/usageWindowMutation.js";
import type { UsageWindowUpdate } from "../types/usageWindowUpdate.js";
import { applyDeductionUpdateToFullSubject } from "./applyDeductionUpdateToFullSubject.js";
import { applyRolloverUpdatesToFullSubject } from "./applyRolloverUpdatesToFullSubject.js";
import { applyUsageWindowUpdatesToFullSubject } from "./applyUsageWindowUpdatesToFullSubject.js";
import { buildUnlimitedPlanMutationLog } from "./buildUnlimitedPlanMutationLog.js";
import { CascadeSpill } from "./cascadeSpill.js";
import { logDeductionUpdatesV2 } from "./logDeductionUpdatesV2.js";
import { mutationLogsToFeaturesV2 } from "./mutationLogsToFeaturesV2.js";
import { normalizeDeductionSyncStateV2 } from "./normalizeDeductionSyncStateV2.js";
import { prepareDeductionOptionsV2 } from "./prepareDeductionOptionsV2.js";
import { prepareFeatureDeductionV2 } from "./prepareFeatureDeductionV2.js";
import { rollbackDeductionV2 } from "./rollbackDeductionV2.js";

export const executeRedisDeductionV2 = async ({
	ctx,
	fullSubject,
	entityId,
	deductions,
	idempotencyKey,
	deductionOptions = {},
	redisInstance,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	entityId?: string;
	deductions: FeatureDeduction[];
	idempotencyKey?: string | null;
	deductionOptions?: DeductionOptions;
	redisInstance?: Redis;
}): Promise<{
	oldFullSubject: FullSubject;
	fullSubject: FullSubject;
	updates: Record<string, DeductionUpdate>;
	rolloverUpdates: Record<string, RolloverUpdate>;
	mutationLogs: MutationLogItem[];
	modifiedCusEntIdsByFeatureId: Record<string, string[]>;
	usageWindowUpdates: UsageWindowUpdate[];
	usageWindowMutations: UsageWindowMutation[];
}> => {
	const { org, env } = ctx;
	const oldFullSubject = structuredClone(fullSubject);

	const options = prepareDeductionOptionsV2({
		ctx,
		fullSubject,
		options: deductionOptions,
		deductions,
	});

	if (options.paidAllocated) {
		throw new RedisDeductionError({
			message: "Paid allocated deductions are not supported for Redis",
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
			message: "Skipping cache is not supported for Redis",
			code: RedisDeductionErrorCode.SkipCache,
		});
	}

	let allUpdates: Record<string, DeductionUpdate> = {};
	let allRolloverUpdates: Record<string, RolloverUpdate> = {};
	let allMutationLogs: MutationLogItem[] = [];
	let allUsageWindowMutations: UsageWindowMutation[] = [];
	const allModifiedCusEntIdsByFeatureId: Record<string, string[]> = {};
	// Keyed by feature id: each Lua result carries the COMPLETE post-deduction
	// counter array per capped feature, so last write wins across deductions.
	const allUsageWindowUpdates: Record<string, UsageWindowUpdate> = {};

	const customerId = fullSubject.customerId;
	const routingKey = buildFullSubjectKey({
		orgId: org.id,
		env,
		customerId,
		entityId: fullSubject.entityId,
	});

	// One timestamp for the whole operation: the resolver keys windows from it
	// and Lua receives the same value, so they never disagree on the window.
	const usageWindowNow = Date.now();

	const cascadeSpill = new CascadeSpill();

	try {
		for (const deduction of deductions) {
			const {
				feature,
				deduction: toDeduct,
				targetBalance,
				unwindValue,
				lockReceiptKey,
			} = deduction;

			const effectiveToDeduct =
				deduction.cascade?.role === "overage"
					? cascadeSpill.effectiveAmount({ deduction })
					: toDeduct;
			if (deduction.cascade?.role === "overage" && effectiveToDeduct === 0) {
				continue;
			}
			const legOverageBehaviour = cascadeSpill.effectiveOverageBehaviour({
				deduction,
				requestBehaviour: options.overageBehaviour,
			});

			const {
				customerEntitlementDeductions,
				spendLimitByFeatureId,
				usageBasedCusEntIdsByFeatureId,
				usageWindowLimits,
				usageWindowFeatureIds,
				rollovers,
				customerEntitlements,
				unlimitedFeatureIds,
				unlimitedCusEnt,
				lock: preparedLock,
			} = prepareFeatureDeductionV2({
				ctx,
				fullSubject,
				deduction,
				options: { ...options, overageBehaviour: legOverageBehaviour },
				now: usageWindowNow,
			});

			if (unlimitedFeatureIds.length > 0) {
				if (preparedLock?.enabled) {
					await saveLockReceiptV2({
						lock: preparedLock,
						customerId,
						featureId: feature.id,
						entityId,
						items: [],
						overrideLockValue: effectiveToDeduct,
						redisInstance: redisInstance ?? ctx.redisV2,
					});
				}
				const unlimitedPlanLog = buildUnlimitedPlanMutationLog({
					unlimitedCusEnt,
					toDeduct: effectiveToDeduct,
					fallbackDeduction: deduction.deduction,
					entityId,
				});
				if (unlimitedPlanLog) {
					allMutationLogs.push(unlimitedPlanLog);
				}
				// An unlimited included leg covers the whole event: nothing spills and
				// there is no balance mutation to compensate.
				cascadeSpill.recordIncludedResult({
					deduction,
					remaining: 0,
					mutationLogs: [],
				});
				continue;
			}

			const idempotencyRedisKey = idempotencyKey
				? getRedisTrackFeatureIdempotencyKey({
						ctx,
						customerId,
						featureId: feature.id,
					}).redisKey
				: null;

			const { keys, balanceKeyIndexByFeatureId } =
				buildDeductFromSubjectBalancesKeys({
					orgId: org.id,
					env,
					customerId,
					routingKey,
					lockReceiptKey: preparedLock?.redis_receipt_key ?? lockReceiptKey,
					idempotencyKey: idempotencyRedisKey,
					customerEntitlementDeductions,
					fallbackFeatureId: feature.id,
					usageWindowFeatureIds,
				});

			// Usage windows are enforced/incremented only for real positive
			// consumption, never for target_balance set-downs or granted-balance edits.
			const isConsumption =
				notNullish(effectiveToDeduct) &&
				(effectiveToDeduct as number) > 0 &&
				!notNullish(targetBalance) &&
				!options.alterGrantedBalance;

			const luaParams = {
				org_id: org.id,
				env,
				customer_id: customerId,
				customer_entitlement_deductions: customerEntitlementDeductions,
				balance_key_index_by_feature_id: balanceKeyIndexByFeatureId,
				spend_limit_by_feature_id: spendLimitByFeatureId ?? null,
				usage_based_cus_ent_ids_by_feature_id:
					usageBasedCusEntIdsByFeatureId ?? null,
				usage_window_limits: usageWindowLimits ?? null,
				usage_window_now: usageWindowNow,
				usage_window_ttl_seconds: FULL_SUBJECT_CACHE_TTL_SECONDS,
				is_consumption: isConsumption,
				amount_to_deduct: effectiveToDeduct ?? null,
				target_balance: targetBalance ?? null,
				target_entity_id: entityId || null,
				rollovers: rollovers.length > 0 ? rollovers : null,
				skip_additional_balance: options.skipAdditionalBalance,
				alter_granted_balance: options.alterGrantedBalance,
				overage_behaviour: legOverageBehaviour,
				feature_id: feature.id,
				idempotency_ttl_ms:
					idempotencyRedisKey !== null ? TRACK_V3_IDEMPOTENCY_TTL_MS : null,
				lock: preparedLock
					? {
							...preparedLock,
							region: currentRegion,
						}
					: null,
				unwind_value: unwindValue ?? null,
				unwind_items: deduction.unwindItems ?? null,
				debug: process.env.NODE_ENV !== "production",
			};

			const targetRedis = redisInstance ?? ctx.redisV2;

			const result = await tryRedisWrite(
				() =>
					targetRedis.deductFromSubjectBalances(
						keys.length,
						...keys,
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
					`[executeRedisDeductionV2] Logs: ${resultJson.logs.join("\n")}`,
				);
			}

			if (resultJson.error) {
				throw new RedisDeductionError({
					message: `Redis deduction failed: ${resultJson.error}`,
					code: resultJson.error as RedisDeductionErrorCode,
					featureId: resultJson.feature_id,
				});
			}

			const { updates, rollover_updates } = resultJson;
			const mutationLogs = Array.isArray(resultJson.mutation_logs)
				? resultJson.mutation_logs
				: [];
			const usageWindowMutations = Array.isArray(
				resultJson.usage_window_mutations,
			)
				? resultJson.usage_window_mutations
				: [];
			const usageWindowsByFeatureId =
				resultJson.usage_windows_by_feature_id ?? {};
			const modifiedCustomerEntitlementIds = Array.isArray(
				resultJson.modified_customer_entitlement_ids,
			)
				? resultJson.modified_customer_entitlement_ids
				: Object.keys(updates);

			logDeductionUpdatesV2({
				ctx,
				fullSubject,
				updates,
				source: "executeRedisDeductionV2",
			});

			allUpdates = { ...allUpdates, ...updates };
			allRolloverUpdates = { ...allRolloverUpdates, ...rollover_updates };
			allMutationLogs = [...allMutationLogs, ...mutationLogs];
			allUsageWindowMutations = [
				...allUsageWindowMutations,
				...usageWindowMutations,
			];
			// Typed handoff for the PG mirror; empty arrays kept (prune-to-empty
			// must still full-replace).
			for (const [featureId, usageWindows] of Object.entries(
				usageWindowsByFeatureId,
			)) {
				allUsageWindowUpdates[featureId] = {
					internal_customer_id: fullSubject.internalCustomerId,
					feature_id: featureId,
					usage_windows: usageWindows,
				};
			}

			const syncState = normalizeDeductionSyncStateV2({
				customerEntitlements,
				updates,
				mutationLogs,
				modifiedCustomerEntitlementIds,
				syncUpdates: {},
				modifiedCusEntIdsByFeatureId: allModifiedCusEntIdsByFeatureId,
			});
			Object.assign(
				allModifiedCusEntIdsByFeatureId,
				syncState.modifiedCusEntIdsByFeatureId,
			);

			const oldFullCustomer = fullSubjectToFullCustomer({
				fullSubject: oldFullSubject,
			});

			try {
				applyRolloverUpdatesToFullSubject({
					fullSubject,
					rolloverUpdates: rollover_updates,
				});

				applyUsageWindowUpdatesToFullSubject({
					fullSubject,
					usageWindowsByFeatureId: resultJson.usage_windows_by_feature_id,
				});

				for (const customerEntitlementId of Object.keys(updates)) {
					const update = updates[customerEntitlementId];
					const customerEntitlement = customerEntitlements.find(
						(ce: FullCusEntWithFullCusProduct) =>
							ce.id === customerEntitlementId,
					);

					if (!customerEntitlement) continue;

					await createAllocatedInvoice({
						ctx,
						customerEntitlement,
						oldFullCustomer,
						update,
					});

					applyDeductionUpdateToFullSubject({
						fullSubject,
						customerEntitlementId,
						update,
					});
				}
			} catch (error) {
				// if (error.message?.includes("declined")) {
				// 	return;
				// }
				if (error instanceof Error && !error?.message?.includes("declined")) {
					ctx.logger.error(
						`[executeRedisDeductionV2] Attempting rollback due to error: ${error}`,
					);
				}
				await rollbackDeductionV2({
					ctx,
					oldFullSubject,
					updates,
				});
				throw error;
			}

			cascadeSpill.recordIncludedResult({
				deduction,
				remaining: resultJson.remaining,
				mutationLogs,
			});

			const featuresFromMutationLogs = mutationLogsToFeaturesV2({
				fullSubject,
				mutationLogs,
			});

			const newFullCustomer = fullSubjectToFullCustomer({ fullSubject });

			fireTrackWebhooks({
				ctx,
				oldFullCus: oldFullCustomer,
				newFullCus: newFullCustomer,
				feature: deduction.feature,
				entityId,
				featuresFromMutationLogs,
			});

			if (options.triggerAutoTopUp) {
				triggerAutoTopUp({
					ctx,
					newFullCus: newFullCustomer,
					feature: deduction.feature,
				}).catch((error) => {
					ctx.logger.error(
						`[executeRedisDeductionV2] Failed to trigger auto top-up: ${error}`,
					);
				});
			}
		}
	} catch (error) {
		await compensateCascadeIncludedLeg({
			ctx,
			fullSubject,
			entityId,
			cascadeSpill,
			redisInstance,
		});
		throw error;
	}

	return {
		oldFullSubject,
		fullSubject,
		updates: allUpdates,
		rolloverUpdates: allRolloverUpdates,
		mutationLogs: allMutationLogs,
		modifiedCusEntIdsByFeatureId: allModifiedCusEntIdsByFeatureId,
		usageWindowUpdates: Object.values(allUsageWindowUpdates),
		usageWindowMutations: allUsageWindowMutations,
	};
};

/**
 * Restores a cascade's included leg after a later leg failed, by replaying the
 * included mutations as an inline unwind. Compensation failures are logged
 * loudly but never mask the original error.
 */
const compensateCascadeIncludedLeg = async ({
	ctx,
	fullSubject,
	entityId,
	cascadeSpill,
	redisInstance,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	entityId?: string;
	cascadeSpill: CascadeSpill;
	redisInstance?: Redis;
}): Promise<void> => {
	const compensation = cascadeSpill.buildCompensation();
	if (!compensation) return;

	try {
		await executeRedisDeductionV2({
			ctx,
			fullSubject,
			entityId,
			deductions: [compensation],
			idempotencyKey: null,
			deductionOptions: { overageBehaviour: "cap", triggerAutoTopUp: false },
			redisInstance,
		});
	} catch (compensationError) {
		ctx.logger.error(
			`[executeRedisDeductionV2] track_cascade_compensation_failed: customer ${fullSubject.customerId}, feature ${compensation.feature.id}, unwind value ${compensation.unwindValue}: ${compensationError}`,
		);
	}
};
