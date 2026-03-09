import {
	type FinalizeLockParamsV0,
	findFeatureById,
	tryCatch,
} from "@autumn/shared";
import { currentRegion } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { executePostgresDeduction } from "@/internal/balances/utils/deduction/executePostgresDeduction.js";
import { executeRedisDeduction } from "@/internal/balances/utils/deduction/executeRedisDeduction.js";
import { fetchLockReceipt } from "@/internal/balances/utils/lock/fetchLockReceipt.js";
import { calculateUnwindValue } from "@/internal/balances/utils/lock/unwindLockUtils.js";
import { deductionUpdatesToModifiedIds } from "@/internal/balances/utils/sync/deductionUpdatesToModifiedIds.js";
import { globalSyncBatchingManagerV2 } from "@/internal/balances/utils/sync/SyncBatchingManagerV2.js";
import type { DeductionUpdate } from "@/internal/balances/utils/types/deductionUpdate.js";
import type { FeatureDeduction } from "@/internal/balances/utils/types/featureDeduction.js";
import { RedisDeductionError } from "@/internal/balances/utils/types/redisDeductionError.js";
import type { RolloverUpdate } from "@/internal/balances/utils/types/rolloverUpdate.js";
import { getOrSetCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/getOrSetCachedFullCustomer.js";

const queueSyncItem = ({
	ctx,
	customerId,
	updates,
	rolloverUpdates,
}: {
	ctx: AutumnContext;
	customerId: string;
	updates: Record<string, DeductionUpdate>;
	rolloverUpdates: Record<string, RolloverUpdate>;
}) => {
	const modifiedCusEntIds = deductionUpdatesToModifiedIds({ updates });
	const rolloverIds = Object.keys(rolloverUpdates);

	if (modifiedCusEntIds.length === 0 && rolloverIds.length === 0) return;

	ctx.logger.info(`[QUEUE SYNC] (${customerId})`);
	globalSyncBatchingManagerV2.addSyncItem({
		customerId,
		orgId: ctx.org.id,
		env: ctx.env,
		cusEntIds: modifiedCusEntIds,
		rolloverIds,
		region: currentRegion,
	});
};

export const finalizeLock = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: FinalizeLockParamsV0;
}) => {
	const { receipt, lockReceiptKey } = await fetchLockReceipt({
		ctx,
		lockKey: params.lock_key,
	});

	const fullCustomer = await getOrSetCachedFullCustomer({
		ctx,
		customerId: receipt.customer_id!,
		entityId: receipt.entity_id ?? undefined,
		source: "finalizeLock",
	});

	const finalValue =
		params.finalize_action === "release" ? 0 : params.overwrite_value;

	const { unwindValue, additionalValue } = calculateUnwindValue({
		receipt,
		finalValue,
	});

	const feature = findFeatureById({
		features: ctx.features,
		featureId: receipt.feature_id,
		errorOnNotFound: true,
	});

	const deduction: FeatureDeduction = {
		feature,
		deduction: additionalValue,
		lockReceipt: receipt,

		// For unwinding when finalizing a lock
		unwindValue,
		lockReceiptKey,
	};

	const deductionOptions = {
		triggerAutoTopUp: true,
	};

	const { data: redisResult, error } = await tryCatch(
		executeRedisDeduction({
			ctx,
			fullCustomer,
			entityId: receipt.entity_id ?? undefined,
			deductions: [deduction],
			deductionOptions,
		}),
	);

	if (error) {
		if (error instanceof RedisDeductionError && error.shouldFallback()) {
			ctx.logger.warn(
				`Falling back to Postgres for finalize lock: ${error.code}`,
			);

			await executePostgresDeduction({
				ctx,
				fullCustomer,
				customerId: receipt.customer_id,
				entityId: receipt.entity_id ?? undefined,
				deductions: [deduction],
				options: deductionOptions,
			});

			return {
				success: true,
			};
		}

		throw error;
	}

	const { updates, rolloverUpdates } = redisResult;

	queueSyncItem({
		ctx,
		customerId: receipt.customer_id,
		updates,
		rolloverUpdates,
	});

	return {
		success: true,
	};
};
