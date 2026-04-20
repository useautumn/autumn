import { currentRegion } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeRedisDeductionV2 } from "@/internal/balances/utils/deductionV2/executeRedisDeductionV2.js";
import type { FinalizeLockContextV2 } from "@/internal/balances/utils/lockV2/buildFinalizeLockContextV2.js";
import { deductionUpdatesToModifiedIds } from "@/internal/balances/utils/sync/deductionUpdatesToModifiedIds.js";
import { globalSyncBatchingManagerV3 } from "@/internal/balances/utils/sync/SyncBatchingManagerV3.js";
import { RedisDeductionError } from "@/internal/balances/utils/types/redisDeductionError.js";
import { insertFinalizeLockEventV2 } from "./insertFinalizeLockEventV2.js";
import { runPostgresFinalizeLockV2 } from "./runPostgresFinalizeLockV2.js";

export const runRedisFinalizeLockV2 = async ({
	ctx,
	finalizeLockContext,
}: {
	ctx: AutumnContext;
	finalizeLockContext: FinalizeLockContextV2;
}) => {
	const { receipt, fullSubject, deduction, deductionOptions } =
		finalizeLockContext;

	let redisResult: Awaited<ReturnType<typeof executeRedisDeductionV2>>;

	try {
		redisResult = await executeRedisDeductionV2({
			ctx,
			fullSubject,
			entityId: receipt.entity_id ?? undefined,
			deductions: [deduction],
			deductionOptions,
		});
	} catch (error) {
		if (error instanceof RedisDeductionError && error.shouldFallback()) {
			ctx.logger.warn(
				`[FINALIZE LOCK V2] Falling back to Postgres: ${error.code}`,
			);
			await runPostgresFinalizeLockV2({ ctx, finalizeLockContext });
			return;
		}

		throw error;
	}

	const { updates, rolloverUpdates, modifiedCusEntIdsByFeatureId } =
		redisResult;
	const modifiedCusEntIds = deductionUpdatesToModifiedIds({ updates });
	const rolloverIds = Object.keys(rolloverUpdates);

	if (modifiedCusEntIds.length > 0 || rolloverIds.length > 0) {
		ctx.logger.info(`[QUEUE SYNC V4] (${receipt.customer_id})`);
		globalSyncBatchingManagerV3.addSyncItem({
			customerId: receipt.customer_id,
			orgId: ctx.org.id,
			env: ctx.env,
			cusEntIds: modifiedCusEntIds,
			rolloverIds,
			region: currentRegion,
			entityId: receipt.entity_id ?? undefined,
			modifiedCusEntIdsByFeatureId,
		});
	}

	insertFinalizeLockEventV2({ ctx, finalizeLockContext });
};
