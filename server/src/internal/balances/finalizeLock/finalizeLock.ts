import { type FinalizeLockParamsV0, findFeatureById } from "@autumn/shared";
import { currentRegion } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { executeRedisDeduction } from "@/internal/balances/utils/deduction/executeRedisDeduction.js";
import { fetchLockReceipt } from "@/internal/balances/utils/lock/fetchLockReceipt.js";
import { calculateUnwindValue } from "@/internal/balances/utils/lock/unwindLockUtils.js";
import { deductionUpdatesToModifiedIds } from "@/internal/balances/utils/sync/deductionUpdatesToModifiedIds.js";
import { globalSyncBatchingManagerV2 } from "@/internal/balances/utils/sync/SyncBatchingManagerV2.js";
import type { DeductionUpdate } from "@/internal/balances/utils/types/deductionUpdate.js";
import type { FeatureDeduction } from "@/internal/balances/utils/types/featureDeduction.js";
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

		// For unwinding when finalizing a lock
		unwindValue,
		lockReceiptKey,
	};

	const { updates, rolloverUpdates } = await executeRedisDeduction({
		ctx,
		fullCustomer,
		entityId: receipt.entity_id ?? undefined,
		deductions: [deduction],
		deductionOptions: {
			triggerAutoTopUp: true,
		},
	});

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
