import type {
	FullCusEntWithFullCusProduct,
	FullCustomer,
} from "@autumn/shared";
import type { Redis } from "ioredis";
import { currentRegion, redis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { handlePaidAllocatedCusEnt } from "@/internal/balances/utils/paidAllocatedFeature/handlePaidAllocatedCusEnt.js";
import { rollbackDeduction } from "@/internal/balances/utils/paidAllocatedFeature/rollbackDeduction.js";
import { buildFullCustomerCacheKey } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/fullCustomerCacheConfig.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import {
	buildCascadeCompensationFailureError,
	type CascadeCompensationOutcome,
	CascadeSpill,
	isCascadeBusinessRejection,
} from "../deductionV2/cascadeSpill.js";
import { saveLockReceipt } from "../lock/saveLockReceipt.js";
import { attachCascadeReplayState } from "../types/cascadeReplayState.js";
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
import {
	type DeductionSideEffect,
	flushDeductionSideEffects,
	queueDeductionSideEffect,
	removeDeductionSideEffectsForFeature,
} from "./deductionSideEffects.js";
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

	if (options.paidAllocatedV1) {
		throw new RedisDeductionError({
			message: `Paid allocated deductions are not supported for Redis`,
			code: RedisDeductionErrorCode.PaidAllocated,
		});
	}

	if (options.paidAllocatedV1 && deductions.some((d) => d.lock)) {
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
	const sideEffects: DeductionSideEffect[] = [];

	const customerId = fullCustomer.id || fullCustomer.internal_id;
	const cacheKey = buildFullCustomerCacheKey({
		orgId: org.id,
		env,
		customerId,
	});

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
				rollovers,
				customerEntitlements,
				unlimitedFeatureIds,
				lock: preparedLock,
			} = prepareFeatureDeduction({
				ctx,
				fullCustomer,
				deduction,
				options: { ...options, overageBehaviour: legOverageBehaviour },
			});

			if (unlimitedFeatureIds.length > 0) {
				if (preparedLock) {
					await saveLockReceipt({
						lock: preparedLock,
						customerId,
						featureId: feature.id,
						entityId,
						items: [],
						overrideLockValue: effectiveToDeduct,
						redisInstance,
					});
				}
				cascadeSpill.recordIncludedResult({
					deduction,
					remaining: 0,
					mutationLogs: [],
				});
				continue;
			}

			if (customerEntitlements.length === 0) {
				if (deduction.cascade?.role === "overage") {
					throw new RedisDeductionError({
						message: `Redis deduction failed: ${RedisDeductionErrorCode.InsufficientBalance}`,
						code: RedisDeductionErrorCode.InsufficientBalance,
						featureId: feature.id,
						rejectedValue: effectiveToDeduct,
					});
				}
				cascadeSpill.recordIncludedResult({
					deduction,
					remaining: deduction.deduction,
					mutationLogs: [],
				});
				continue;
			}

			const luaParams = {
				org_id: org.id,
				env,
				customer_id: customerId,
				sorted_entitlements: customerEntitlementDeductions,
				spend_limit_by_feature_id: spendLimitByFeatureId ?? null,
				usage_based_cus_ent_ids_by_feature_id:
					usageBasedCusEntIdsByFeatureId ?? null,
				amount_to_deduct: effectiveToDeduct ?? null,
				target_balance: targetBalance ?? null,
				target_entity_id: entityId || null,
				rollovers: rollovers.length > 0 ? rollovers : null,
				skip_additional_balance: options.skipAdditionalBalance,
				alter_granted_balance: options.alterGrantedBalance,
				overage_behaviour: legOverageBehaviour,
				feature_id: feature.id,
				lock: preparedLock
					? {
							...preparedLock,
							region: currentRegion,
						}
					: null,

				// For unwinding when finalizing a lock
				unwind_value: unwindValue ?? null,
				unwind_items: deduction.unwindItems ?? null,
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
					featureId: resultJson.feature_id,
					rejectedValue:
						resultJson.error === RedisDeductionErrorCode.InsufficientBalance
							? effectiveToDeduct
							: undefined,
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

			try {
				applyRolloverUpdatesToFullCustomer({
					fullCus: fullCustomer,
					rolloverUpdates: rollover_updates,
				});

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

			cascadeSpill.recordIncludedResult({
				deduction,
				remaining: resultJson.remaining,
				mutationLogs: mutation_logs,
			});

			const featuresFromMutationLogs = mutationLogsToFeatures({
				fullCustomer,
				mutationLogs: mutation_logs,
			});

			if (options.triggerSideEffects) {
				queueDeductionSideEffect({
					sideEffect: {
						oldFullCus,
						newFullCus: fullCustomer,
						feature: deduction.feature,
						entityId,
						featuresFromMutationLogs,
						triggerAutoTopUp: options.triggerAutoTopUp,
					},
					sideEffects,
				});
			}
		}
	} catch (error) {
		const compensationOutcome = await compensateCascadeIncludedLeg({
			ctx,
			fullCustomer,
			entityId,
			cascadeSpill,
			redisInstance,
		});
		if (compensationOutcome.status === "succeeded") {
			removeDeductionSideEffectsForFeature({
				sideEffects,
				featureId: compensationOutcome.compensatedFeatureId,
			});
		} else if (compensationOutcome.status === "failed") {
			if (isCascadeBusinessRejection(error)) {
				throw buildCascadeCompensationFailureError({
					source: "executeRedisDeduction",
					error,
				});
			}
			attachCascadeReplayState({
				error,
				state: cascadeSpill.buildReplayState(),
			});
		}
		throw error;
	} finally {
		flushDeductionSideEffects({
			ctx,
			sideEffects,
			source: "executeRedisDeduction",
		});
	}

	return {
		oldFullCus,
		fullCus: fullCustomer,
		updates: allUpdates,
		rolloverUpdates: allRolloverUpdates,
		mutationLogs: allMutationLogs,
	};
};

/**
 * Restores a cascade's included deduction after a later deduction failed, by
 * replaying the included mutations as an inline unwind. Compensation failures
 * are logged loudly but never mask the original error.
 */
const compensateCascadeIncludedLeg = async ({
	ctx,
	fullCustomer,
	entityId,
	cascadeSpill,
	redisInstance,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	entityId?: string;
	cascadeSpill: CascadeSpill;
	redisInstance?: Redis;
}): Promise<CascadeCompensationOutcome> => {
	const compensation = cascadeSpill.buildCompensation();
	if (!compensation) return { status: "not_needed" };

	try {
		await executeRedisDeduction({
			ctx,
			entityId,
			deductions: [compensation],
			fullCustomer,
			deductionOptions: {
				overageBehaviour: "cap",
				triggerAutoTopUp: false,
				triggerSideEffects: false,
			},
			redisInstance,
		});
		return {
			status: "succeeded",
			compensatedFeatureId: compensation.feature.id,
		};
	} catch (compensationError) {
		ctx.logger.error(
			`[executeRedisDeduction] cascade compensation failed: ${compensationError}`,
			{
				type: "track_cascade_compensation_failed",
				customer_id: fullCustomer.id,
				feature_id: compensation.feature.id,
				unwind_value: compensation.unwindValue,
			},
		);
		return { status: "failed" };
	}
};
