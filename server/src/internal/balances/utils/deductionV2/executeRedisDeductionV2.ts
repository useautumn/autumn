import {
	type FullCusEntWithFullCusProduct,
	type FullSubject,
	fullSubjectToFullCustomer,
} from "@autumn/shared";
import type { Redis } from "ioredis";
import { currentRegion } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { triggerAutoTopUp } from "@/internal/balances/autoTopUp/triggerAutoTopUp.js";
import { fireTrackWebhooks } from "@/internal/balances/trackWebhooks/fireTrackWebhooks.js";
import { createAllocatedInvoice } from "@/internal/balances/utils/allocatedInvoice/createAllocatedInvoice.js";
import { buildDeductFromSubjectBalancesKeys } from "@/internal/customers/cache/fullSubject/builders/buildDeductFromSubjectBalancesKeys.js";
import { buildFullSubjectKey } from "@/internal/customers/cache/fullSubject/builders/buildFullSubjectKey.js";
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
import { applyDeductionUpdateToFullSubject } from "./applyDeductionUpdateToFullSubject.js";
import { applyRolloverUpdatesToFullSubject } from "./applyRolloverUpdatesToFullSubject.js";
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
	deductionOptions = {},
	redisInstance,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	entityId?: string;
	deductions: FeatureDeduction[];
	deductionOptions?: DeductionOptions;
	redisInstance?: Redis;
}): Promise<{
	oldFullSubject: FullSubject;
	fullSubject: FullSubject;
	updates: Record<string, DeductionUpdate>;
	rolloverUpdates: Record<string, RolloverUpdate>;
	mutationLogs: MutationLogItem[];
	modifiedCusEntIdsByFeatureId: Record<string, string[]>;
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
	const allModifiedCusEntIdsByFeatureId: Record<string, string[]> = {};

	const customerId = fullSubject.customerId;
	const routingKey = buildFullSubjectKey({
		orgId: org.id,
		env,
		customerId,
		entityId: fullSubject.entityId,
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
		} = prepareFeatureDeductionV2({
			ctx,
			fullSubject,
			deduction,
			options,
		});

		if (unlimitedFeatureIds.length > 0) {
			continue;
		}

		const { keys, balanceKeyIndexByFeatureId } =
			buildDeductFromSubjectBalancesKeys({
				orgId: org.id,
				env,
				customerId,
				routingKey,
				lockReceiptKey: preparedLock?.redis_receipt_key ?? lockReceiptKey,
				customerEntitlementDeductions,
				fallbackFeatureId: feature.id,
			});

		const luaParams = {
			org_id: org.id,
			env,
			customer_id: customerId,
			customer_entitlement_deductions: customerEntitlementDeductions,
			balance_key_index_by_feature_id: balanceKeyIndexByFeatureId,
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
			unwind_value: unwindValue ?? null,
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
				code: RedisDeductionErrorCode.SubjectBalanceNotFound,
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
			});
		}

		const { updates, rollover_updates } = resultJson;
		const mutationLogs = Array.isArray(resultJson.mutation_logs)
			? resultJson.mutation_logs
			: [];
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

			for (const customerEntitlementId of Object.keys(updates)) {
				const update = updates[customerEntitlementId];
				const customerEntitlement = customerEntitlements.find(
					(ce: FullCusEntWithFullCusProduct) => ce.id === customerEntitlementId,
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

	return {
		oldFullSubject,
		fullSubject,
		updates: allUpdates,
		rolloverUpdates: allRolloverUpdates,
		mutationLogs: allMutationLogs,
		modifiedCusEntIdsByFeatureId: allModifiedCusEntIdsByFeatureId,
	};
};
